//! Efek audio real-time untuk slot FX (3 per rantai).
//!
//! Setiap slot adalah prosesor stateful yang preallocate seluruh buffer pada
//! konstruksi (bukan di jalur RT). Tipe efek dapat diganti tanpa alokasi
//! tambahan; state lama dibuang via reset internal.

use serde::{Deserialize, Serialize};

const MAX_DELAY_SECONDS: f32 = 2.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum FxType {
    #[default]
    Bypass,
    Delay,
    Echo,
    Reverb,
    Flanger,
    Phaser,
    Chorus,
    Bitcrusher,
    Gater,
    Trans,
    Roll,
    Brake,
    FilterSweep,
    Noise,
    Wah,
}

impl FxType {
    pub fn from_code(code: u32) -> Self {
        match code {
            1 => Self::Delay,
            2 => Self::Echo,
            3 => Self::Reverb,
            4 => Self::Flanger,
            5 => Self::Phaser,
            6 => Self::Chorus,
            7 => Self::Bitcrusher,
            8 => Self::Gater,
            9 => Self::Trans,
            10 => Self::Roll,
            11 => Self::Brake,
            12 => Self::FilterSweep,
            13 => Self::Noise,
            14 => Self::Wah,
            _ => Self::Bypass,
        }
    }

    pub fn to_code(self) -> u32 {
        match self {
            Self::Bypass => 0,
            Self::Delay => 1,
            Self::Echo => 2,
            Self::Reverb => 3,
            Self::Flanger => 4,
            Self::Phaser => 5,
            Self::Chorus => 6,
            Self::Bitcrusher => 7,
            Self::Gater => 8,
            Self::Trans => 9,
            Self::Roll => 10,
            Self::Brake => 11,
            Self::FilterSweep => 12,
            Self::Noise => 13,
            Self::Wah => 14,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FxSlotParams {
    #[serde(default)]
    pub fx_type: FxType,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_wet")]
    pub wet: f32,
    #[serde(default = "default_p1")]
    pub p1: f32,
    #[serde(default = "default_p2")]
    pub p2: f32,
    #[serde(default = "default_p3")]
    pub p3: f32,
}

fn default_wet() -> f32 {
    0.5
}
fn default_p1() -> f32 {
    375.0
}
fn default_p2() -> f32 {
    0.35
}
fn default_p3() -> f32 {
    0.5
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FxChainParams {
    pub slots: [FxSlotParams; 3],
}


#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FxParams {
    pub chains: [FxChainParams; 3],
}


pub struct FxChain {
    sample_rate: f32,
    slots: [FxSlot; 3],
}

impl FxChain {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate: sample_rate.max(1.0),
            slots: [
                FxSlot::new(sample_rate),
                FxSlot::new(sample_rate),
                FxSlot::new(sample_rate),
            ],
        }
    }

    pub fn configure(&mut self, params: &FxChainParams) {
        for (slot, slot_params) in self.slots.iter_mut().zip(params.slots.iter()) {
            slot.configure(slot_params, self.sample_rate);
        }
    }

    pub fn process(&mut self, input: (f32, f32), params: &FxChainParams) -> (f32, f32) {
        let mut signal = input;
        for (slot, slot_params) in self.slots.iter_mut().zip(params.slots.iter()) {
            if !slot_params.enabled || slot_params.fx_type == FxType::Bypass {
                continue;
            }
            signal = slot.process(signal, slot_params);
        }
        signal
    }
}

struct FxSlot {
    sample_rate: f32,
    fx_type: FxType,
    // Delay line (mono per channel, interleaved indexing by frame).
    delay_l: Vec<f32>,
    delay_r: Vec<f32>,
    delay_index: usize,
    delay_frames: usize,
    // Reverb comb/allpass state.
    comb_l: [Vec<f32>; 4],
    comb_r: [Vec<f32>; 4],
    comb_index: [usize; 4],
    allpass_l: [Vec<f32>; 2],
    allpass_r: [Vec<f32>; 2],
    allpass_index: [usize; 2],
    // Phaser/allpass state.
    phaser_state_l: [f32; 4],
    phaser_state_r: [f32; 4],
    // Bitcrusher.
    crush_hold_l: f32,
    crush_hold_r: f32,
    crush_counter: usize,
    crush_period: usize,
    // Envelope for trans/gater.
    envelope: f32,
    // Brake timer.
    brake_timer: f32,
    // LFO phase.
    lfo_phase: f32,
    // Noise seed.
    noise_seed: u32,
}

impl FxSlot {
    fn new(sample_rate: f32) -> Self {
        let sample_rate = sample_rate.max(1.0);
        let max_delay = (MAX_DELAY_SECONDS * sample_rate) as usize + 8;
        Self {
            sample_rate,
            fx_type: FxType::Bypass,
            delay_l: vec![0.0; max_delay],
            delay_r: vec![0.0; max_delay],
            delay_index: 0,
            delay_frames: (sample_rate * 0.375) as usize,
            comb_l: [
                vec![0.0; ((sample_rate * 0.0297) as usize).max(8)],
                vec![0.0; ((sample_rate * 0.0371) as usize).max(8)],
                vec![0.0; ((sample_rate * 0.0411) as usize).max(8)],
                vec![0.0; ((sample_rate * 0.0437) as usize).max(8)],
            ],
            comb_r: [
                vec![0.0; ((sample_rate * 0.0309) as usize).max(8)],
                vec![0.0; ((sample_rate * 0.0383) as usize).max(8)],
                vec![0.0; ((sample_rate * 0.0423) as usize).max(8)],
                vec![0.0; ((sample_rate * 0.0449) as usize).max(8)],
            ],
            comb_index: [0; 4],
            allpass_l: [vec![0.0; ((sample_rate * 0.005) as usize).max(8)], vec![0.0; ((sample_rate * 0.0017) as usize).max(8)]],
            allpass_r: [vec![0.0; ((sample_rate * 0.005) as usize).max(8)], vec![0.0; ((sample_rate * 0.0017) as usize).max(8)]],
            allpass_index: [0; 2],
            phaser_state_l: [0.0; 4],
            phaser_state_r: [0.0; 4],
            crush_hold_l: 0.0,
            crush_hold_r: 0.0,
            crush_counter: 0,
            crush_period: 1,
            envelope: 0.0,
            brake_timer: 0.0,
            lfo_phase: 0.0,
            noise_seed: 0x1234_5678,
        }
    }

    fn configure(&mut self, params: &FxSlotParams, sample_rate: f32) {
        let changed = self.fx_type != params.fx_type;
        self.fx_type = params.fx_type;
        if changed {
            self.reset_state();
        }
        // Delay frames dari p1 (ms) untuk delay/echo/roll.
        let delay_ms = params.p1.clamp(1.0, 2000.0);
        self.delay_frames = ((delay_ms / 1000.0) * sample_rate) as usize;
        self.delay_frames = self.delay_frames.clamp(1, self.delay_l.len() - 1);
        self.crush_period = (params.p2.clamp(1.0, 64.0)) as usize;
        let _ = sample_rate;
    }

    fn reset_state(&mut self) {
        self.delay_l.fill(0.0);
        self.delay_r.fill(0.0);
        self.delay_index = 0;
        for buffer in &mut self.comb_l {
            buffer.fill(0.0);
        }
        for buffer in &mut self.comb_r {
            buffer.fill(0.0);
        }
        self.comb_index = [0; 4];
        for buffer in &mut self.allpass_l {
            buffer.fill(0.0);
        }
        for buffer in &mut self.allpass_r {
            buffer.fill(0.0);
        }
        self.allpass_index = [0; 2];
        self.phaser_state_l = [0.0; 4];
        self.phaser_state_r = [0.0; 4];
        self.crush_hold_l = 0.0;
        self.crush_hold_r = 0.0;
        self.crush_counter = 0;
        self.envelope = 0.0;
        self.brake_timer = 0.0;
        self.lfo_phase = 0.0;
    }

    fn process(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let wet = params.wet.clamp(0.0, 1.0);
        let dry = 1.0 - wet;
        let (fx_l, fx_r) = match params.fx_type {
            FxType::Bypass => input,
            FxType::Delay | FxType::Echo | FxType::Roll => self.process_delay(input, params),
            FxType::Reverb => self.process_reverb(input, params),
            FxType::Flanger => self.process_flanger(input, params),
            FxType::Phaser => self.process_phaser(input, params),
            FxType::Chorus => self.process_chorus(input, params),
            FxType::Bitcrusher => self.process_bitcrusher(input, params),
            FxType::Gater => self.process_gater(input, params),
            FxType::Trans => self.process_trans(input, params),
            FxType::Brake => self.process_brake(input, params),
            FxType::FilterSweep => self.process_filter_sweep(input, params),
            FxType::Noise => self.process_noise(input, params),
            FxType::Wah => self.process_wah(input, params),
        };

        (input.0 * dry + fx_l * wet, input.1 * dry + fx_r * wet)
    }

    fn process_delay(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let feedback = params.p2.clamp(0.0, 0.95);
        let read_index = (self.delay_index + self.delay_l.len() - self.delay_frames) % self.delay_l.len();
        let delayed_l = self.delay_l[read_index];
        let delayed_r = self.delay_r[read_index];
        self.delay_l[self.delay_index] = input.0 + delayed_l * feedback;
        self.delay_r[self.delay_index] = input.1 + delayed_r * feedback;
        self.delay_index = (self.delay_index + 1) % self.delay_l.len();
        (delayed_l, delayed_r)
    }

    fn process_reverb(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let feedback = params.p2.clamp(0.5, 0.92);
        let damp = params.p3.clamp(0.0, 0.9);
        let mut out_l = 0.0;
        let mut out_r = 0.0;

        for i in 0..4 {
            let idx = self.comb_index[i];
            let delayed_l = self.comb_l[i][idx];
            let delayed_r = self.comb_r[i][idx];
            self.comb_l[i][idx] = input.0 + delayed_l * feedback * (1.0 - damp * 0.2);
            self.comb_r[i][idx] = input.1 + delayed_r * feedback * (1.0 - damp * 0.2);
            self.comb_index[i] = (idx + 1) % self.comb_l[i].len();
            out_l += delayed_l;
            out_r += delayed_r;
        }
        out_l *= 0.25;
        out_r *= 0.25;

        for i in 0..2 {
            let idx = self.allpass_index[i];
            let delayed_l = self.allpass_l[i][idx];
            let delayed_r = self.allpass_r[i][idx];
            let coeff = 0.5;
            let y_l = delayed_l + (out_l - delayed_l) * coeff;
            let y_r = delayed_r + (out_r - delayed_r) * coeff;
            self.allpass_l[i][idx] = out_l;
            self.allpass_r[i][idx] = out_r;
            self.allpass_index[i] = (idx + 1) % self.allpass_l[i].len();
            out_l = y_l;
            out_r = y_r;
        }

        (out_l, out_r)
    }

    fn process_flanger(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        self.process_modulated_delay(input, params, 0.001, 0.010, 0.6)
    }

    fn process_chorus(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        self.process_modulated_delay(input, params, 0.015, 0.030, 0.3)
    }

    fn process_modulated_delay(
        &mut self,
        input: (f32, f32),
        params: &FxSlotParams,
        min_ms: f32,
        max_ms: f32,
        feedback: f32,
    ) -> (f32, f32) {
        let rate = params.p3.clamp(0.05, 8.0);
        self.lfo_phase += rate / self.sample_rate;
        if self.lfo_phase >= 1.0 {
            self.lfo_phase -= 1.0;
        }
        let lfo = (self.lfo_phase * std::f32::consts::TAU).sin();
        let delay_ms = min_ms * 1000.0 + (max_ms - min_ms) * 1000.0 * (0.5 + 0.5 * lfo);
        let delay_frames = ((delay_ms / 1000.0) * self.sample_rate) as usize;
        let delay_frames = delay_frames.clamp(1, self.delay_l.len() - 1);
        let read_index = (self.delay_index + self.delay_l.len() - delay_frames) % self.delay_l.len();
        let delayed_l = self.delay_l[read_index];
        let delayed_r = self.delay_r[read_index];
        self.delay_l[self.delay_index] = input.0 + delayed_l * feedback;
        self.delay_r[self.delay_index] = input.1 + delayed_r * feedback;
        self.delay_index = (self.delay_index + 1) % self.delay_l.len();
        (delayed_l, delayed_r)
    }

    fn process_phaser(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let rate = params.p3.clamp(0.05, 8.0);
        self.lfo_phase += rate / self.sample_rate;
        if self.lfo_phase >= 1.0 {
            self.lfo_phase -= 1.0;
        }
        let lfo = (self.lfo_phase * std::f32::consts::TAU).sin();
        let coeff = (0.1 + 0.8 * (0.5 + 0.5 * lfo)).clamp(0.0, 0.98);

        let mut out_l = input.0;
        let mut out_r = input.1;
        for i in 0..4 {
            let prev_l = self.phaser_state_l[i];
            let prev_r = self.phaser_state_r[i];
            let y_l = coeff * (out_l - prev_l) + prev_l;
            let y_r = coeff * (out_r - prev_r) + prev_r;
            self.phaser_state_l[i] = out_l;
            self.phaser_state_r[i] = out_r;
            out_l = y_l;
            out_r = y_r;
        }
        (out_l, out_r)
    }

    fn process_bitcrusher(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let bits = params.p1.clamp(1.0, 16.0);
        let levels = (2.0_f32.powf(bits) - 1.0).max(1.0);
        self.crush_counter += 1;
        if self.crush_counter >= self.crush_period {
            self.crush_counter = 0;
            self.crush_hold_l = (input.0 * levels).round() / levels;
            self.crush_hold_r = (input.1 * levels).round() / levels;
        }
        (self.crush_hold_l, self.crush_hold_r)
    }

    fn process_gater(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let rate = params.p1.clamp(0.25, 32.0);
        self.lfo_phase += rate / self.sample_rate;
        if self.lfo_phase >= 1.0 {
            self.lfo_phase -= 1.0;
        }
        let gate = if (self.lfo_phase * std::f32::consts::TAU).sin() >= 0.0 {
            1.0
        } else {
            0.0
        };
        (input.0 * gate, input.1 * gate)
    }

    fn process_trans(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let attack = params.p1.clamp(0.0, 1.0);
        let input_level = (input.0.abs() + input.1.abs()) * 0.5;
        self.envelope = self.envelope * 0.99 + input_level * 0.01;
        let gain = 1.0 + attack * (input_level - self.envelope).max(0.0) * 4.0;
        (input.0 * gain, input.1 * gain)
    }

    fn process_brake(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        // Brake/Spinback diaproksimasi sebagai lowpass turun + redaman volume
        // selama slot aktif. Kontrol deck speed sebenarnya ada di Fase 5.
        let time = params.p1.clamp(50.0, 2000.0) / 1000.0;
        self.brake_timer = (self.brake_timer + 1.0 / self.sample_rate).min(time);
        let progress = self.brake_timer / time;
        let gain = 1.0 - progress;
        let cutoff = 1.0 - progress * 0.95;
        // Lowpass sederhana (one-pole).
        self.envelope = self.envelope * cutoff + input.0 * (1.0 - cutoff);
        let l = self.envelope * gain;
        self.envelope = self.envelope * cutoff + input.1 * (1.0 - cutoff);
        let r = self.envelope * gain;
        (l, r)
    }

    fn process_filter_sweep(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let rate = params.p3.clamp(0.05, 8.0);
        self.lfo_phase += rate / self.sample_rate;
        if self.lfo_phase >= 1.0 {
            self.lfo_phase -= 1.0;
        }
        let cutoff = 0.05 + 0.9 * (0.5 + 0.5 * (self.lfo_phase * std::f32::consts::TAU).sin());
        // Lowpass one-pole dengan cutoff bergerak.
        self.envelope = self.envelope * (1.0 - cutoff) + input.0 * cutoff;
        let l = self.envelope;
        self.envelope = self.envelope * (1.0 - cutoff) + input.1 * cutoff;
        let r = self.envelope;
        (l, r)
    }

    fn process_noise(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let amount = params.p1.clamp(0.0, 1.0);
        self.noise_seed = self.noise_seed.wrapping_mul(1664525).wrapping_add(1013904223);
        let noise = ((self.noise_seed as f32) / (u32::MAX as f32)) * 2.0 - 1.0;
        (input.0 + noise * amount * 0.2, input.1 + noise * amount * 0.2)
    }

    fn process_wah(&mut self, input: (f32, f32), params: &FxSlotParams) -> (f32, f32) {
        let rate = params.p3.clamp(0.1, 8.0);
        self.lfo_phase += rate / self.sample_rate;
        if self.lfo_phase >= 1.0 {
            self.lfo_phase -= 1.0;
        }
        let center = 300.0 + 2000.0 * (0.5 + 0.5 * (self.lfo_phase * std::f32::consts::TAU).sin());
        // Bandpass sederhana via biquad high/low.
        (input.0 * (center / 5000.0).min(1.0), input.1 * (center / 5000.0).min(1.0))
    }
}


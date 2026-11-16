//! Mixer dua channel, crossfader, master, limiter, dan cue bus.
//!
//! Pembagian tanggung jawab:
//! - `MixerControls`: parameter atomic yang ditulis UI dan dibaca callback.
//! - `Mixer`: state DSP preallocated (EQ/filter/fader per channel, limiter,
//!   smoothing gain) yang hanya disentuh callback audio.
//!
//! Cue bus diambil **post-EQ/filter, pre-fader** (PFL) dari kedua channel,
//! lalu dicampur ke headphone memakai cue mix/volume. Routing headphone ke
//! channel output dilakukan engine berdasarkan jumlah channel perangkat.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use serde::{Deserialize, Serialize};

use crate::audio::limiter::Limiter;
use crate::dsp::eq::{EqSettings, ThreeBandEq};
use crate::dsp::filter::DjFilter;

const GAIN_SMOOTHING_SECONDS: f32 = 0.01;
pub const DECK_CHANNELS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum CrossfaderCurve {
    #[default]
    Smooth,
    ConstantPower,
    Sharp,
}

impl CrossfaderCurve {
    fn to_code(self) -> u32 {
        match self {
            Self::Smooth => 0,
            Self::ConstantPower => 1,
            Self::Sharp => 2,
        }
    }

    fn from_code(code: u32) -> Self {
        match code {
            1 => Self::ConstantPower,
            2 => Self::Sharp,
            _ => Self::Smooth,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ChannelAssign {
    A,
    B,
    #[default]
    Thru,
}

impl ChannelAssign {
    fn to_code(self) -> u32 {
        match self {
            Self::A => 0,
            Self::B => 1,
            Self::Thru => 2,
        }
    }

    fn from_code(code: u32) -> Self {
        match code {
            0 => Self::A,
            1 => Self::B,
            _ => Self::Thru,
        }
    }
}

fn store_f32(slot: &AtomicU32, value: f32) {
    slot.store(value.to_bits(), Ordering::Relaxed);
}

fn load_f32(slot: &AtomicU32) -> f32 {
    f32::from_bits(slot.load(Ordering::Relaxed))
}

/// Parameter channel strip satu deck.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelParams {
    pub low_db: f32,
    pub mid_db: f32,
    pub high_db: f32,
    pub low_kill: bool,
    pub mid_kill: bool,
    pub high_kill: bool,
    pub filter: f32,
    pub fader: f32,
    pub pfl: bool,
    pub assign: ChannelAssign,
}

impl Default for ChannelParams {
    fn default() -> Self {
        Self {
            low_db: 0.0,
            mid_db: 0.0,
            high_db: 0.0,
            low_kill: false,
            mid_kill: false,
            high_kill: false,
            filter: 0.0,
            fader: 1.0,
            pfl: false,
            assign: ChannelAssign::Thru,
        }
    }
}

/// Snapshot parameter mixer untuk callback (Copy, tanpa alokasi).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixerParams {
    pub channels: [ChannelParams; DECK_CHANNELS],
    pub crossfader: f32,
    pub crossfader_curve: CrossfaderCurve,
    pub crossfader_reverse: bool,
    pub master_volume: f32,
    pub master_balance: f32,
    pub limiter_enabled: bool,
    pub cue_volume: f32,
    pub cue_mix: f32,
    pub split_cue: bool,
}

impl Default for MixerParams {
    fn default() -> Self {
        let mut channels = [ChannelParams::default(); DECK_CHANNELS];
        if DECK_CHANNELS > 0 {
            channels[0].assign = ChannelAssign::A;
        }
        if DECK_CHANNELS > 1 {
            channels[1].assign = ChannelAssign::B;
        }
        Self {
            channels,
            crossfader: 0.5,
            crossfader_curve: CrossfaderCurve::Smooth,
            crossfader_reverse: false,
            master_volume: 1.0,
            master_balance: 0.0,
            limiter_enabled: true,
            cue_volume: 0.7,
            cue_mix: 1.0,
            split_cue: false,
        }
    }
}

/// Update parsial channel; field `None` tidak diubah.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChannelUpdate {
    pub low_db: Option<f32>,
    pub mid_db: Option<f32>,
    pub high_db: Option<f32>,
    pub low_kill: Option<bool>,
    pub mid_kill: Option<bool>,
    pub high_kill: Option<bool>,
    pub filter: Option<f32>,
    pub fader: Option<f32>,
    pub pfl: Option<bool>,
    pub assign: Option<ChannelAssign>,
}

/// Update parsial dari UI; field `None` tidak diubah.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MixerUpdate {
    pub channel_a: Option<ChannelUpdate>,
    pub channel_b: Option<ChannelUpdate>,
    pub crossfader: Option<f32>,
    pub crossfader_curve: Option<CrossfaderCurve>,
    pub crossfader_reverse: Option<bool>,
    pub master_volume: Option<f32>,
    pub master_balance: Option<f32>,
    pub limiter_enabled: Option<bool>,
    pub cue_volume: Option<f32>,
    pub cue_mix: Option<f32>,
    pub split_cue: Option<bool>,
}

struct ChannelControls {
    low_db: AtomicU32,
    mid_db: AtomicU32,
    high_db: AtomicU32,
    low_kill: AtomicBool,
    mid_kill: AtomicBool,
    high_kill: AtomicBool,
    filter: AtomicU32,
    fader: AtomicU32,
    pfl: AtomicBool,
    assign: AtomicU32,
}

impl ChannelControls {
    fn new() -> Self {
        let defaults = ChannelParams::default();
        Self {
            low_db: AtomicU32::new(defaults.low_db.to_bits()),
            mid_db: AtomicU32::new(defaults.mid_db.to_bits()),
            high_db: AtomicU32::new(defaults.high_db.to_bits()),
            low_kill: AtomicBool::new(defaults.low_kill),
            mid_kill: AtomicBool::new(defaults.mid_kill),
            high_kill: AtomicBool::new(defaults.high_kill),
            filter: AtomicU32::new(defaults.filter.to_bits()),
            fader: AtomicU32::new(defaults.fader.to_bits()),
            pfl: AtomicBool::new(defaults.pfl),
            assign: AtomicU32::new(defaults.assign.to_code()),
        }
    }

    fn params(&self) -> ChannelParams {
        ChannelParams {
            low_db: load_f32(&self.low_db),
            mid_db: load_f32(&self.mid_db),
            high_db: load_f32(&self.high_db),
            low_kill: self.low_kill.load(Ordering::Relaxed),
            mid_kill: self.mid_kill.load(Ordering::Relaxed),
            high_kill: self.high_kill.load(Ordering::Relaxed),
            filter: load_f32(&self.filter),
            fader: load_f32(&self.fader),
            pfl: self.pfl.load(Ordering::Relaxed),
            assign: ChannelAssign::from_code(self.assign.load(Ordering::Relaxed)),
        }
    }

    fn apply(&self, update: &ChannelUpdate) {
        if let Some(value) = update.low_db {
            store_f32(&self.low_db, value.clamp(-26.0, 12.0));
        }
        if let Some(value) = update.mid_db {
            store_f32(&self.mid_db, value.clamp(-26.0, 12.0));
        }
        if let Some(value) = update.high_db {
            store_f32(&self.high_db, value.clamp(-26.0, 12.0));
        }
        if let Some(value) = update.low_kill {
            self.low_kill.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.mid_kill {
            self.mid_kill.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.high_kill {
            self.high_kill.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.filter {
            store_f32(&self.filter, value.clamp(-1.0, 1.0));
        }
        if let Some(value) = update.fader {
            store_f32(&self.fader, value.clamp(0.0, 1.0));
        }
        if let Some(value) = update.pfl {
            self.pfl.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.assign {
            self.assign.store(value.to_code(), Ordering::Relaxed);
        }
    }
}

/// Parameter mixer lock-free (dibaca callback, ditulis command UI).
pub struct MixerControls {
    channels: [ChannelControls; DECK_CHANNELS],
    crossfader: AtomicU32,
    crossfader_curve: AtomicU32,
    crossfader_reverse: AtomicBool,
    master_volume: AtomicU32,
    master_balance: AtomicU32,
    limiter_enabled: AtomicBool,
    cue_volume: AtomicU32,
    cue_mix: AtomicU32,
    split_cue: AtomicBool,
}

impl MixerControls {
    pub fn new() -> Self {
        let defaults = MixerParams::default();
        Self {
            channels: [ChannelControls::new(), ChannelControls::new()],
            crossfader: AtomicU32::new(defaults.crossfader.to_bits()),
            crossfader_curve: AtomicU32::new(defaults.crossfader_curve.to_code()),
            crossfader_reverse: AtomicBool::new(defaults.crossfader_reverse),
            master_volume: AtomicU32::new(defaults.master_volume.to_bits()),
            master_balance: AtomicU32::new(defaults.master_balance.to_bits()),
            limiter_enabled: AtomicBool::new(defaults.limiter_enabled),
            cue_volume: AtomicU32::new(defaults.cue_volume.to_bits()),
            cue_mix: AtomicU32::new(defaults.cue_mix.to_bits()),
            split_cue: AtomicBool::new(defaults.split_cue),
        }
    }

    pub fn params(&self) -> MixerParams {
        MixerParams {
            channels: [self.channels[0].params(), self.channels[1].params()],
            crossfader: load_f32(&self.crossfader),
            crossfader_curve: CrossfaderCurve::from_code(
                self.crossfader_curve.load(Ordering::Relaxed),
            ),
            crossfader_reverse: self.crossfader_reverse.load(Ordering::Relaxed),
            master_volume: load_f32(&self.master_volume),
            master_balance: load_f32(&self.master_balance),
            limiter_enabled: self.limiter_enabled.load(Ordering::Relaxed),
            cue_volume: load_f32(&self.cue_volume),
            cue_mix: load_f32(&self.cue_mix),
            split_cue: self.split_cue.load(Ordering::Relaxed),
        }
    }

    pub fn apply(&self, update: MixerUpdate) {
        if let Some(channel) = update.channel_a.as_ref() {
            self.channels[0].apply(channel);
        }
        if let Some(channel) = update.channel_b.as_ref() {
            self.channels[1].apply(channel);
        }
        if let Some(value) = update.crossfader {
            store_f32(&self.crossfader, value.clamp(0.0, 1.0));
        }
        if let Some(value) = update.crossfader_curve {
            self.crossfader_curve
                .store(value.to_code(), Ordering::Relaxed);
        }
        if let Some(value) = update.crossfader_reverse {
            self.crossfader_reverse.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.master_volume {
            store_f32(&self.master_volume, value.clamp(0.0, 1.0));
        }
        if let Some(value) = update.master_balance {
            store_f32(&self.master_balance, value.clamp(-1.0, 1.0));
        }
        if let Some(value) = update.limiter_enabled {
            self.limiter_enabled.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.cue_volume {
            store_f32(&self.cue_volume, value.clamp(0.0, 1.0));
        }
        if let Some(value) = update.cue_mix {
            store_f32(&self.cue_mix, value.clamp(0.0, 1.0));
        }
        if let Some(value) = update.split_cue {
            self.split_cue.store(value, Ordering::Relaxed);
        }
    }
}

impl Default for MixerControls {
    fn default() -> Self {
        Self::new()
    }
}

/// Gain crossfader untuk channel dengan assignment tertentu.
pub fn crossfader_gain(
    position: f32,
    curve: CrossfaderCurve,
    assign: ChannelAssign,
    reverse: bool,
) -> f32 {
    let position = position.clamp(0.0, 1.0);
    let position = if reverse { 1.0 - position } else { position };

    let (gain_a, gain_b) = match curve {
        CrossfaderCurve::Smooth => (1.0 - position, position),
        CrossfaderCurve::ConstantPower => {
            let angle = position * std::f32::consts::FRAC_PI_2;
            (angle.cos(), angle.sin())
        }
        CrossfaderCurve::Sharp => {
            let a = smoothstep((1.0 - position).powf(0.25));
            (a, 1.0 - a)
        }
    };

    match assign {
        ChannelAssign::A => gain_a,
        ChannelAssign::B => gain_b,
        ChannelAssign::Thru => 1.0,
    }
}

fn smoothstep(value: f32) -> f32 {
    let x = value.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

#[derive(Debug, Clone, Copy, Default)]
pub struct MixerFrame {
    pub master_l: f32,
    pub master_r: f32,
    pub head_l: f32,
    pub head_r: f32,
}

struct ChannelStrip {
    eq: ThreeBandEq,
    filter: DjFilter,
    fader_coefficient: f32,
    fader_gain: f32,
    target_fader: f32,
    pfl: bool,
}

impl ChannelStrip {
    fn new(sample_rate: f32) -> Self {
        let coefficient = 1.0 - (-1.0 / (GAIN_SMOOTHING_SECONDS * sample_rate.max(1.0))).exp();
        Self {
            eq: ThreeBandEq::new(sample_rate),
            filter: DjFilter::new(sample_rate),
            fader_coefficient: coefficient,
            fader_gain: 1.0,
            target_fader: 1.0,
            pfl: false,
        }
    }

    fn configure(&mut self, params: &ChannelParams) {
        self.eq.configure(EqSettings {
            low_db: params.low_db,
            mid_db: params.mid_db,
            high_db: params.high_db,
            low_kill: params.low_kill,
            mid_kill: params.mid_kill,
            high_kill: params.high_kill,
        });
        self.filter.configure(params.filter);
        self.target_fader = params.fader;
        self.pfl = params.pfl;
    }

    /// Kembalikan (audio post-fader, cue pre-fader).
    #[inline]
    fn process(&mut self, left: f32, right: f32) -> ((f32, f32), (f32, f32)) {
        let (left, right) = self.eq.process_stereo(left, right);
        let (left, right) = self.filter.process_stereo(left, right);
        let cue = if self.pfl { (left, right) } else { (0.0, 0.0) };

        self.fader_gain += (self.target_fader - self.fader_gain) * self.fader_coefficient;
        ((left * self.fader_gain, right * self.fader_gain), cue)
    }
}

/// State DSP mixer; hanya dipakai callback audio.
pub struct Mixer {
    channels: [ChannelStrip; DECK_CHANNELS],
    limiter: Limiter,
    master_coefficient: f32,
    cue_coefficient: f32,
    cross_coefficient: f32,
    master_gain: f32,
    cue_gain: f32,
    cross_gain: [f32; DECK_CHANNELS],
    target_master: f32,
    target_cue: f32,
    target_cross: [f32; DECK_CHANNELS],
    balance_l: f32,
    balance_r: f32,
    cue_mix: f32,
}

impl Mixer {
    pub fn new(sample_rate: f32) -> Self {
        let coefficient = 1.0 - (-1.0 / (GAIN_SMOOTHING_SECONDS * sample_rate.max(1.0))).exp();
        Self {
            channels: [
                ChannelStrip::new(sample_rate),
                ChannelStrip::new(sample_rate),
            ],
            limiter: Limiter::new(sample_rate),
            master_coefficient: coefficient,
            cue_coefficient: coefficient,
            cross_coefficient: coefficient,
            master_gain: 1.0,
            cue_gain: 0.7,
            cross_gain: [1.0; DECK_CHANNELS],
            target_master: 1.0,
            target_cue: 0.7,
            target_cross: [1.0; DECK_CHANNELS],
            balance_l: 1.0,
            balance_r: 1.0,
            cue_mix: 1.0,
        }
    }

    pub fn configure(&mut self, params: &MixerParams) {
        for index in 0..DECK_CHANNELS {
            let channel = &params.channels[index];
            self.channels[index].configure(channel);
            self.target_cross[index] = crossfader_gain(
                params.crossfader,
                params.crossfader_curve,
                channel.assign,
                params.crossfader_reverse,
            );
        }

        self.limiter.set_enabled(params.limiter_enabled);
        self.target_master = params.master_volume;
        self.target_cue = params.cue_volume;

        let balance = params.master_balance.clamp(-1.0, 1.0);
        self.balance_l = if balance <= 0.0 { 1.0 } else { 1.0 - balance };
        self.balance_r = if balance >= 0.0 { 1.0 } else { 1.0 + balance };
        self.cue_mix = params.cue_mix;
    }

    #[inline]
    pub fn process(&mut self, deck_a: (f32, f32), deck_b: (f32, f32), tone: f32) -> MixerFrame {
        let inputs = [deck_a, deck_b];
        let mut master_l = tone;
        let mut master_r = tone;
        let mut cue_l = 0.0_f32;
        let mut cue_r = 0.0_f32;        for (index, input) in inputs.iter().enumerate().take(DECK_CHANNELS) {
            let ((left, right), cue) = self.channels[index].process(input.0, input.1);
            self.cross_gain[index] +=
                (self.target_cross[index] - self.cross_gain[index]) * self.cross_coefficient;
            master_l += left * self.cross_gain[index];
            master_r += right * self.cross_gain[index];
            cue_l += cue.0;
            cue_r += cue.1;
        }

        self.master_gain += (self.target_master - self.master_gain) * self.master_coefficient;
        self.cue_gain += (self.target_cue - self.cue_gain) * self.cue_coefficient;

        let master_l = master_l * self.master_gain * self.balance_l;
        let master_r = master_r * self.master_gain * self.balance_r;
        let (master_l, master_r) = self.limiter.process_stereo(master_l, master_r);

        let head_l = (self.cue_mix * cue_l + (1.0 - self.cue_mix) * master_l) * self.cue_gain;
        let head_r = (self.cue_mix * cue_r + (1.0 - self.cue_mix) * master_r) * self.cue_gain;

        MixerFrame {
            master_l,
            master_r,
            head_l,
            head_r,
        }
    }

    pub fn take_limiter_reduction_db(&mut self) -> f32 {
        self.limiter.take_reduction_db()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crossfader_endpoints_and_assignment() {
        for curve in [
            CrossfaderCurve::Smooth,
            CrossfaderCurve::ConstantPower,
            CrossfaderCurve::Sharp,
        ] {
            assert!(
                (crossfader_gain(0.0, curve, ChannelAssign::A, false) - 1.0).abs() < 1e-5,
                "{curve:?}"
            );
            assert!(
                crossfader_gain(1.0, curve, ChannelAssign::A, false).abs() < 1e-5,
                "{curve:?}"
            );
            assert!(
                crossfader_gain(0.0, curve, ChannelAssign::B, false).abs() < 1e-5,
                "{curve:?}"
            );
            assert!(
                (crossfader_gain(1.0, curve, ChannelAssign::B, false) - 1.0).abs() < 1e-5,
                "{curve:?}"
            );
            assert!(
                (crossfader_gain(0.37, curve, ChannelAssign::Thru, false) - 1.0).abs() < 1e-5,
                "{curve:?}"
            );
        }
    }

    #[test]
    fn reverse_and_sharp_curve_behave() {
        let normal = crossfader_gain(0.2, CrossfaderCurve::Smooth, ChannelAssign::A, false);
        let reversed = crossfader_gain(0.2, CrossfaderCurve::Smooth, ChannelAssign::A, true);
        assert!((normal - 0.8).abs() < 1e-5);
        assert!((reversed - 0.2).abs() < 1e-5);

        let sharp = crossfader_gain(0.2, CrossfaderCurve::Sharp, ChannelAssign::A, false);
        let smooth = crossfader_gain(0.2, CrossfaderCurve::Smooth, ChannelAssign::A, false);
        assert!(sharp > smooth, "sharp = {sharp}, smooth = {smooth}");
        assert!(sharp > 0.9, "sharp = {sharp}");
    }

    #[test]
    fn constant_power_keeps_energy() {
        for step in 0..=10 {
            let position = step as f32 / 10.0;
            let a = crossfader_gain(
                position,
                CrossfaderCurve::ConstantPower,
                ChannelAssign::A,
                false,
            );
            let b = crossfader_gain(
                position,
                CrossfaderCurve::ConstantPower,
                ChannelAssign::B,
                false,
            );
            assert!((a * a + b * b - 1.0).abs() < 1e-5);
        }
    }

    #[test]
    fn controls_clamp_and_roundtrip() {
        let controls = MixerControls::new();
        controls.apply(MixerUpdate {
            channel_a: Some(ChannelUpdate {
                low_db: Some(40.0),
                filter: Some(-5.0),
                fader: Some(2.0),
                assign: Some(ChannelAssign::A),
                ..ChannelUpdate::default()
            }),
            channel_b: Some(ChannelUpdate {
                pfl: Some(true),
                ..ChannelUpdate::default()
            }),
            master_balance: Some(-3.0),
            crossfader_curve: Some(CrossfaderCurve::Sharp),
            ..MixerUpdate::default()
        });

        let params = controls.params();
        assert!((params.channels[0].low_db - 12.0).abs() < 1e-5);
        assert!((params.channels[0].filter + 1.0).abs() < 1e-5);
        assert!((params.channels[0].fader - 1.0).abs() < 1e-5);
        assert!((params.master_balance + 1.0).abs() < 1e-5);
        assert_eq!(params.crossfader_curve, CrossfaderCurve::Sharp);
        assert_eq!(params.channels[0].assign, ChannelAssign::A);
        assert!(params.channels[1].pfl);
    }

    #[test]
    fn cue_bus_removes_signal_when_pfl_off() {
        let mut mixer = Mixer::new(48_000.0);
        let params = MixerParams {
            cue_volume: 1.0,
            ..MixerParams::default()
        };
        mixer.configure(&params);
        let frame = mixer.process((0.5, -0.5), (0.2, -0.2), 0.0);
        assert_eq!(frame.head_l, 0.0);
        assert_eq!(frame.head_r, 0.0);
    }

    #[test]
    fn pfl_sums_selected_channels_into_cue() {
        let mut mixer = Mixer::new(48_000.0);
        let mut params = MixerParams {
            cue_volume: 1.0,
            cue_mix: 1.0,
            ..MixerParams::default()
        };
        params.channels[1].pfl = true;
        mixer.configure(&params);

        let mut head_peak = 0.0_f32;
        for _ in 0..128 {
            let frame = mixer.process((0.5, 0.5), (0.25, 0.25), 0.0);
            head_peak = head_peak.max(frame.head_l.abs());
        }
        assert!(
            head_peak > 0.1,
            "cue channel B tidak terdengar: {head_peak}"
        );
    }

    #[test]
    fn limiter_reduces_master_peak() {
        let mut mixer = Mixer::new(48_000.0);
        let params = MixerParams {
            master_volume: 1.0,
            limiter_enabled: true,
            ..MixerParams::default()
        };
        mixer.configure(&params);

        let mut peak = 0.0_f32;
        for index in 0..9_600 {
            let value = (2.0 * std::f32::consts::PI * 200.0 * index as f32 / 48_000.0).sin() * 2.0;
            let frame = mixer.process((value, value), (value, value), 0.0);
            peak = peak.max(frame.master_l.abs());
        }
        assert!(peak <= 0.99, "peak = {peak}");
        assert!(mixer.take_limiter_reduction_db() > 1.0);
    }
}

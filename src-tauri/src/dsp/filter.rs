//! Filter DJ satu knob: tengah = bypass, kiri = LPF, kanan = HPF.
//!
//! Parameter `-1.0..=1.0`:
//! - `-1.0` LPF cutoff 200 Hz (suara teredam),
//! - `0.0` bypass,
//! - `+1.0` HPF cutoff 6 kHz (tipis/telepon).
//!
//! Koefisien dihitung ulang hanya saat parameter berubah; state filter
//! di-reset ketika keluar dari bypass agar tidak ada transient besar.

use super::biquad::{highpass, lowpass, Biquad};

const BYPASS_EPSILON: f32 = 0.005;
const MIN_CUTOFF: f32 = 200.0;
const MAX_CUTOFF: f32 = 20_000.0;
const HIGH_MIN_CUTOFF: f32 = 20.0;
const HIGH_MAX_CUTOFF: f32 = 6_000.0;
const RESONANCE: f32 = 0.9;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Bypass,
    LowPass,
    HighPass,
}

pub struct DjFilter {
    sample_rate: f32,
    lowpass: Biquad,
    highpass: Biquad,
    mode: Mode,
    parameter: f32,
}

impl DjFilter {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            lowpass: Biquad::new(),
            highpass: Biquad::new(),
            mode: Mode::Bypass,
            parameter: 0.0,
        }
    }

    pub fn configure(&mut self, parameter: f32) {
        let parameter = parameter.clamp(-1.0, 1.0);
        if (parameter - self.parameter).abs() < 0.001 && self.mode != Mode::Bypass {
            return;
        }
        self.parameter = parameter;

        let next_mode = if parameter.abs() < BYPASS_EPSILON {
            Mode::Bypass
        } else if parameter < 0.0 {
            Mode::LowPass
        } else {
            Mode::HighPass
        };

        if next_mode == Mode::Bypass {
            self.mode = Mode::Bypass;
            return;
        }

        // Reset state saat mode berubah agar tidak memproses history lama.
        if next_mode != self.mode {
            self.lowpass.reset();
            self.highpass.reset();
        }
        self.mode = next_mode;

        if next_mode == Mode::LowPass {
            let amount = -parameter;
            let cutoff = MAX_CUTOFF * (MIN_CUTOFF / MAX_CUTOFF).powf(amount);
            self.lowpass
                .set_coefficients(lowpass(self.sample_rate, cutoff, RESONANCE));
        } else {
            let cutoff = HIGH_MIN_CUTOFF * (HIGH_MAX_CUTOFF / HIGH_MIN_CUTOFF).powf(parameter);
            self.highpass
                .set_coefficients(highpass(self.sample_rate, cutoff, RESONANCE));
        }
    }

    #[inline]
    pub fn process_stereo(&mut self, left: f32, right: f32) -> (f32, f32) {
        match self.mode {
            Mode::Bypass => (left, right),
            Mode::LowPass => self.lowpass.process_stereo(left, right),
            Mode::HighPass => self.highpass.process_stereo(left, right),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms_at(parameter: f32, frequency: f32) -> f32 {
        let sample_rate = 48_000.0;
        let mut filter = DjFilter::new(sample_rate);
        filter.configure(parameter);

        let frames = 24_000;
        let mut sum = 0.0_f32;
        let mut count = 0_usize;
        for index in 0..frames {
            let value =
                (2.0 * std::f32::consts::PI * frequency * index as f32 / sample_rate).sin() * 0.5;
            let (left, _) = filter.process_stereo(value, value);
            if index > frames / 2 {
                sum += left * left;
                count += 1;
            }
        }

        (sum / count.max(1) as f32).sqrt()
    }

    #[test]
    fn center_is_bypass() {
        let mut filter = DjFilter::new(48_000.0);
        for sample in [0.25, -0.5, 0.1] {
            let (left, right) = filter.process_stereo(sample, -sample);
            assert_eq!(left, sample);
            assert_eq!(right, -sample);
        }
    }

    #[test]
    fn lowpass_sweep_reduces_highs() {
        let low = rms_at(-0.7, 200.0);
        let high = rms_at(-0.7, 5_000.0);
        assert!(low > 0.25, "low = {low}");
        assert!(high < 0.08, "high = {high}");
    }

    #[test]
    fn highpass_sweep_reduces_lows() {
        let low = rms_at(0.7, 100.0);
        let high = rms_at(0.7, 4_000.0);
        assert!(low < 0.08, "low = {low}");
        assert!(high > 0.25, "high = {high}");
    }
}

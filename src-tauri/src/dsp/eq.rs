//! EQ 3-band DJ: low shelf, mid peaking, high shelf + kill switch.
//!
//! Frekuensi tetap (120 Hz / 1 kHz / 8 kHz) mengikuti karakter mixer DJ.
//! `configure()` menghitung koefisien hanya jika setting berubah; pemanggilan
//! per blok dari callback tidak mengalokasi.

use super::biquad::{high_shelf, low_shelf, peaking, Biquad};

/// Redaman kill switch. -60 dB dianggap silence secara auditif.
const KILL_DB: f32 = -60.0;

/// Setting EQ dalam dB dan status kill per band.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EqSettings {
    pub low_db: f32,
    pub mid_db: f32,
    pub high_db: f32,
    pub low_kill: bool,
    pub mid_kill: bool,
    pub high_kill: bool,
}

impl Default for EqSettings {
    fn default() -> Self {
        Self {
            low_db: 0.0,
            mid_db: 0.0,
            high_db: 0.0,
            low_kill: false,
            mid_kill: false,
            high_kill: false,
        }
    }
}

impl EqSettings {
    fn effective(gain_db: f32, kill: bool) -> f32 {
        if kill {
            KILL_DB
        } else {
            gain_db
        }
    }
}

pub struct ThreeBandEq {
    sample_rate: f32,
    low: Biquad,
    mid: Biquad,
    high: Biquad,
    current: EqSettings,
}

impl ThreeBandEq {
    pub fn new(sample_rate: f32) -> Self {
        let mut eq = Self {
            sample_rate,
            low: Biquad::new(),
            mid: Biquad::new(),
            high: Biquad::new(),
            current: EqSettings::default(),
        };
        eq.configure(EqSettings::default());
        eq
    }

    pub fn configure(&mut self, settings: EqSettings) {
        if settings == self.current {
            return;
        }
        self.current = settings;

        self.low.set_coefficients(low_shelf(
            self.sample_rate,
            120.0,
            EqSettings::effective(settings.low_db, settings.low_kill),
        ));
        self.mid.set_coefficients(peaking(
            self.sample_rate,
            1_000.0,
            0.9,
            EqSettings::effective(settings.mid_db, settings.mid_kill),
        ));
        self.high.set_coefficients(high_shelf(
            self.sample_rate,
            8_000.0,
            EqSettings::effective(settings.high_db, settings.high_kill),
        ));
    }

    #[inline]
    pub fn process_stereo(&mut self, left: f32, right: f32) -> (f32, f32) {
        let (left, right) = self.low.process_stereo(left, right);
        let (left, right) = self.mid.process_stereo(left, right);
        self.high.process_stereo(left, right)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms_at(eq: &mut ThreeBandEq, frequency: f32) -> f32 {
        let sample_rate = 48_000.0;
        let frames = 24_000;
        let mut sum = 0.0_f32;
        let mut count = 0_usize;

        for index in 0..frames {
            let value =
                (2.0 * std::f32::consts::PI * frequency * index as f32 / sample_rate).sin() * 0.5;
            let (left, _) = eq.process_stereo(value, value);
            if index > frames / 2 {
                sum += left * left;
                count += 1;
            }
        }

        (sum / count.max(1) as f32).sqrt()
    }

    #[test]
    fn low_boost_raises_bass_only() {
        let mut eq = ThreeBandEq::new(48_000.0);
        eq.configure(EqSettings {
            low_db: 9.0,
            ..EqSettings::default()
        });

        let bass = rms_at(&mut eq, 100.0);
        let mut treble_eq = ThreeBandEq::new(48_000.0);
        treble_eq.configure(EqSettings {
            low_db: 9.0,
            ..EqSettings::default()
        });
        let treble = rms_at(&mut treble_eq, 8_000.0);
        assert!(bass > 0.7, "bass = {bass}");
        assert!(treble < 0.6, "treble = {treble}");
    }

    #[test]
    fn kill_switch_removes_band() {
        let mut eq = ThreeBandEq::new(48_000.0);
        eq.configure(EqSettings {
            low_kill: true,
            ..EqSettings::default()
        });
        let bass = rms_at(&mut eq, 100.0);
        assert!(bass < 0.02, "bass setelah kill = {bass}");
    }

    #[test]
    fn flat_setting_is_passthrough_after_configure() {
        let mut eq = ThreeBandEq::new(48_000.0);
        let mut reference = ThreeBandEq::new(48_000.0);
        reference.configure(EqSettings::default());
        for _ in 0..128 {
            let a = eq.process_stereo(0.3, -0.3);
            let b = reference.process_stereo(0.3, -0.3);
            assert!((a.0 - b.0).abs() < 1e-6);
        }
    }
}

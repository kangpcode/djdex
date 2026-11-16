//! Limiter master stereo-linked untuk perlindungan output.
//!
//! Detektor peak tanpa lookahead: attack 1 ms, release 100 ms, ceiling
//! -0,18 dBFS. Gain reduction dipakai bersama L/R (stereo-linked) agar citra
//! stereo tidak bergeser. Semua state preallocated; dipanggil dari callback.

/// Ceiling linear ≈ -0.18 dBFS.
const CEILING: f32 = 0.98;
const ATTACK_SECONDS: f32 = 0.001;
const RELEASE_SECONDS: f32 = 0.100;

pub struct Limiter {
    enabled: bool,
    gain: f32,
    attack_coefficient: f32,
    release_coefficient: f32,
    /// Pengurangan gain maksimum (dB) sejak pembacaan terakhir.
    reduction_db: f32,
}

impl Limiter {
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = sample_rate.max(1.0);
        Self {
            enabled: true,
            gain: 1.0,
            attack_coefficient: 1.0 - (-1.0 / (ATTACK_SECONDS * sample_rate)).exp(),
            release_coefficient: 1.0 - (-1.0 / (RELEASE_SECONDS * sample_rate)).exp(),
            reduction_db: 0.0,
        }
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    /// Kembalikan gain reduction maksimum (dB, positif) sejak panggilan
    /// terakhir; nilai di-reset ke 0. Dipakai UI meter limiter.
    pub fn take_reduction_db(&mut self) -> f32 {
        std::mem::take(&mut self.reduction_db)
    }

    #[inline]
    pub fn process_stereo(&mut self, left: f32, right: f32) -> (f32, f32) {
        if !self.enabled {
            return (left, right);
        }

        let peak = left.abs().max(right.abs());
        let target = if peak > CEILING { CEILING / peak } else { 1.0 };
        let coefficient = if target < self.gain {
            self.attack_coefficient
        } else {
            self.release_coefficient
        };
        self.gain += (target - self.gain) * coefficient;

        let reduction = if self.gain > 0.0 && self.gain < 1.0 {
            -20.0 * self.gain.log10()
        } else {
            0.0
        };
        if reduction > self.reduction_db {
            self.reduction_db = reduction;
        }

        (
            (left * self.gain).clamp(-CEILING, CEILING),
            (right * self.gain).clamp(-CEILING, CEILING),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_loud_signal_and_recovers() {
        let sample_rate = 48_000.0;
        let mut limiter = Limiter::new(sample_rate);
        let frames = 24_000;
        let mut peak = 0.0_f32;

        for index in 0..frames {
            let value =
                (2.0 * std::f32::consts::PI * 440.0 * index as f32 / sample_rate).sin() * 1.8;
            let (left, right) = limiter.process_stereo(value, -value);
            if index > 480 {
                peak = peak.max(left.abs()).max(right.abs());
            }
        }

        assert!(peak <= CEILING + 1e-4, "peak = {peak}");
        assert!(limiter.take_reduction_db() > 1.0);

        // Input senyap: gain pulih menuju 1. Meter membaca maksimum per
        // interval, jadi polling dilakukan agar nilai akhir mencerminkan
        // pemulihan dan bukan puncak di awal interval.
        let mut last_reduction = f32::INFINITY;
        for _ in 0..40 {
            for _ in 0..(sample_rate as usize / 40) {
                let _ = limiter.process_stereo(0.0, 0.0);
            }
            last_reduction = limiter.take_reduction_db();
        }
        assert!(last_reduction < 0.01, "reduksi akhir = {last_reduction}");
    }

    #[test]
    fn quiet_signal_is_untouched() {
        let mut limiter = Limiter::new(48_000.0);
        for _ in 0..1_000 {
            let (left, right) = limiter.process_stereo(0.2, -0.2);
            assert!((left - 0.2).abs() < 1e-6);
            assert!((right + 0.2).abs() < 1e-6);
        }
        assert_eq!(limiter.take_reduction_db(), 0.0);
    }

    #[test]
    fn disabled_limiter_is_passthrough() {
        let mut limiter = Limiter::new(48_000.0);
        limiter.set_enabled(false);
        let (left, right) = limiter.process_stereo(2.0, -2.0);
        assert_eq!(left, 2.0);
        assert_eq!(right, -2.0);
    }
}

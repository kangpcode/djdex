//! Biquad RBJ (cookbook) untuk EQ dan filter DJ.
//!
//! Semua state dialokasikan saat konstruksi; `process_stereo()` tidak
//! mengalokasi dan aman dipanggil dari callback audio. Koefisien dihitung ulang
//! hanya ketika parameter berubah (dilakukan sekali per blok, bukan per frame).

/// Koefisien biquad yang sudah dinormalisasi terhadap `a0`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BiquadCoefficients {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl BiquadCoefficients {
    pub const IDENTITY: Self = Self {
        b0: 1.0,
        b1: 0.0,
        b2: 0.0,
        a1: 0.0,
        a2: 0.0,
    };
}

/// Biquad stereo dengan transposed direct form II (stabil & hemat state).
pub struct Biquad {
    coefficients: BiquadCoefficients,
    z1: [f32; 2],
    z2: [f32; 2],
}

impl Biquad {
    pub fn new() -> Self {
        Self {
            coefficients: BiquadCoefficients::IDENTITY,
            z1: [0.0; 2],
            z2: [0.0; 2],
        }
    }

    pub fn reset(&mut self) {
        self.z1 = [0.0; 2];
        self.z2 = [0.0; 2];
    }

    pub fn set_coefficients(&mut self, coefficients: BiquadCoefficients) {
        if self.coefficients != coefficients {
            self.coefficients = coefficients;
        }
    }

    #[inline]
    pub fn process_stereo(&mut self, left: f32, right: f32) -> (f32, f32) {
        let c = self.coefficients;

        let out_left = c.b0 * left + self.z1[0];
        self.z1[0] = c.b1 * left - c.a1 * out_left + self.z2[0];
        self.z2[0] = c.b2 * left - c.a2 * out_left;

        let out_right = c.b0 * right + self.z1[1];
        self.z1[1] = c.b1 * right - c.a1 * out_right + self.z2[1];
        self.z2[1] = c.b2 * right - c.a2 * out_right;

        (out_left, out_right)
    }
}

impl Default for Biquad {
    fn default() -> Self {
        Self::new()
    }
}

/// Peaking EQ (RBJ cookbook).
pub fn peaking(sample_rate: f32, frequency: f32, q: f32, gain_db: f32) -> BiquadCoefficients {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let omega = 2.0 * std::f32::consts::PI * frequency / sample_rate;
    let alpha = omega.sin() / (2.0 * q.max(0.01));
    let cos = omega.cos();

    normalize(
        1.0 + alpha * a,
        -2.0 * cos,
        1.0 - alpha * a,
        1.0 + alpha / a,
        -2.0 * cos,
        1.0 - alpha / a,
    )
}

/// Low shelf (S = 1).
pub fn low_shelf(sample_rate: f32, frequency: f32, gain_db: f32) -> BiquadCoefficients {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let omega = 2.0 * std::f32::consts::PI * frequency / sample_rate;
    // S = 1 -> alpha = sin(w0)/2 * sqrt(2).
    let alpha = omega.sin() / 2.0 * std::f32::consts::SQRT_2;
    let cos = omega.cos();
    let sqrt_a = a.sqrt();

    normalize(
        a * ((a + 1.0) - (a - 1.0) * cos + 2.0 * sqrt_a * alpha),
        2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
        a * ((a + 1.0) - (a - 1.0) * cos - 2.0 * sqrt_a * alpha),
        (a + 1.0) + (a - 1.0) * cos + 2.0 * sqrt_a * alpha,
        -2.0 * ((a - 1.0) + (a + 1.0) * cos),
        (a + 1.0) + (a - 1.0) * cos - 2.0 * sqrt_a * alpha,
    )
}

/// High shelf (S = 1).
pub fn high_shelf(sample_rate: f32, frequency: f32, gain_db: f32) -> BiquadCoefficients {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let omega = 2.0 * std::f32::consts::PI * frequency / sample_rate;
    // S = 1 -> alpha = sin(w0)/2 * sqrt(2).
    let alpha = omega.sin() / 2.0 * std::f32::consts::SQRT_2;
    let cos = omega.cos();
    let sqrt_a = a.sqrt();

    normalize(
        a * ((a + 1.0) + (a - 1.0) * cos + 2.0 * sqrt_a * alpha),
        -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
        a * ((a + 1.0) + (a - 1.0) * cos - 2.0 * sqrt_a * alpha),
        (a + 1.0) - (a - 1.0) * cos + 2.0 * sqrt_a * alpha,
        2.0 * ((a - 1.0) - (a + 1.0) * cos),
        (a + 1.0) - (a - 1.0) * cos - 2.0 * sqrt_a * alpha,
    )
}

pub fn lowpass(sample_rate: f32, frequency: f32, q: f32) -> BiquadCoefficients {
    let omega =
        2.0 * std::f32::consts::PI * frequency.clamp(10.0, sample_rate * 0.49) / sample_rate;
    let alpha = omega.sin() / (2.0 * q.max(0.01));
    let cos = omega.cos();

    normalize(
        (1.0 - cos) / 2.0,
        1.0 - cos,
        (1.0 - cos) / 2.0,
        1.0 + alpha,
        -2.0 * cos,
        1.0 - alpha,
    )
}

pub fn highpass(sample_rate: f32, frequency: f32, q: f32) -> BiquadCoefficients {
    let omega =
        2.0 * std::f32::consts::PI * frequency.clamp(10.0, sample_rate * 0.49) / sample_rate;
    let alpha = omega.sin() / (2.0 * q.max(0.01));
    let cos = omega.cos();

    normalize(
        (1.0 + cos) / 2.0,
        -(1.0 + cos),
        (1.0 + cos) / 2.0,
        1.0 + alpha,
        -2.0 * cos,
        1.0 - alpha,
    )
}

fn normalize(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> BiquadCoefficients {
    let a0 = if a0.abs() < 1e-12 { 1.0 } else { a0 };
    BiquadCoefficients {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(samples: &[f32]) -> f32 {
        (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len().max(1) as f32)
            .sqrt()
    }

    fn filtered(coeffs: BiquadCoefficients, frequency: f32, sample_rate: f32) -> f32 {
        let mut biquad = Biquad::new();
        biquad.set_coefficients(coeffs);
        let frames = (sample_rate * 0.5) as usize;
        let mut output = Vec::with_capacity(frames);

        for index in 0..frames {
            let value = (2.0 * std::f32::consts::PI * frequency * index as f32 / sample_rate).sin();
            let (left, _) = biquad.process_stereo(value, value);
            // Buang transient awal.
            if index > frames / 4 {
                output.push(left);
            }
        }

        rms(&output)
    }

    #[test]
    fn identity_is_passthrough() {
        let mut biquad = Biquad::new();
        for _ in 0..100 {
            let (left, right) = biquad.process_stereo(0.5, -0.25);
            assert!((left - 0.5).abs() < 1e-6);
            assert!((right + 0.25).abs() < 1e-6);
        }
    }

    #[test]
    fn lowpass_attenuates_high_frequency() {
        let low = filtered(lowpass(48_000.0, 300.0, 0.9), 200.0, 48_000.0);
        let high = filtered(lowpass(48_000.0, 300.0, 0.9), 8_000.0, 48_000.0);
        assert!(low > 0.5, "low = {low}");
        assert!(high < 0.05, "high = {high}");
    }

    #[test]
    fn peaking_boosts_only_near_center_frequency() {
        let boost = peaking(48_000.0, 1_000.0, 0.9, 9.0);
        let at_center = filtered(boost, 1_000.0, 48_000.0);
        let far = filtered(boost, 8_000.0, 48_000.0);
        assert!(at_center > 1.8, "center = {at_center}");
        assert!(far < 1.2, "far = {far}");
    }
}

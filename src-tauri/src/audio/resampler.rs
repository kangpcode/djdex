//! Resampler stereo untuk worker decode.
//!
//! Implementasi cubic Catmull-Rom: kualitas jauh lebih baik daripada linear
//! untuk konversi 44.1 ↔ 48 kHz, tanpa dependency tambahan, dan seluruh alokasi
//! terjadi di worker thread (bukan callback audio).
//!
//! Fase 3 menambahkan `set_speed()`: langkah dasar (konversi sample rate)
//! dikalikan faktor tempo. Untuk key lock, resampler ini dipakai sebagai
//! pitch-shifter dan `WsolaStretcher` mengembalikan durasinya.

/// Konverter sample rate untuk audio stereo interleaved.
pub struct StereoResampler {
    /// Langkah posisi input per frame output pada speed 1.0.
    base_step: f64,
    /// Langkah efektif: `base_step * speed`.
    step: f64,
    position: f64,
    history: [f32; 2],
    frames: Vec<[f32; 2]>,
}

impl StereoResampler {
    pub fn new(input_rate: u32, output_rate: u32) -> Self {
        let base_step = if input_rate == 0 || output_rate == 0 {
            1.0
        } else {
            f64::from(input_rate) / f64::from(output_rate)
        };

        Self {
            base_step,
            step: base_step,
            position: 0.0,
            history: [0.0, 0.0],
            frames: Vec::with_capacity(4096),
        }
    }

    /// Ubah faktor tempo/pitch tanpa memutus posisi interpolasi.
    pub fn set_speed(&mut self, speed: f32) {
        self.step = self.base_step * f64::from(speed.clamp(0.25, 4.0));
    }

    pub fn reset(&mut self) {
        self.position = 0.0;
        self.history = [0.0, 0.0];
        self.frames.clear();
    }

    /// Proses input stereo interleaved menjadi output stereo interleaved.
    pub fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        if input.is_empty() {
            return;
        }

        let was_empty = self.frames.is_empty();
        self.frames.extend(
            input
                .as_chunks::<2>()
                .0
                .iter()
                .map(|pair| [pair[0], pair[1]]),
        );

        if was_empty {
            // Hindari artefak fade-in: frame pertama menjadi konteks kiri.
            self.history = self.frames[0];
        }

        if (self.step - 1.0).abs() < f64::EPSILON {
            // Rasio 1:1 -> teruskan frame apa adanya (hemat CPU, bit-exact).
            for frame in &self.frames {
                output.push(frame[0]);
                output.push(frame[1]);
            }
            self.frames.clear();
            self.position = 0.0;
            return;
        }

        loop {
            let index = self.position.floor() as isize;
            let fraction = (self.position - index as f64) as f32;

            // Butuh frame index-1 .. index+2 (Catmull-Rom).
            if index + 2 >= self.frames.len() as isize {
                break;
            }

            let p0 = self.frame_at(index - 1);
            let p1 = self.frame_at(index);
            let p2 = self.frame_at(index + 1);
            let p3 = self.frame_at(index + 2);

            output.push(catmull_rom(p0[0], p1[0], p2[0], p3[0], fraction));
            output.push(catmull_rom(p0[1], p1[1], p2[1], p3[1], fraction));

            self.position += self.step;
        }

        let consumed = self.position.floor() as usize;
        if consumed > 0 {
            let consumed = consumed.min(self.frames.len());
            if consumed > 0 {
                self.history = self.frames[consumed - 1];
                self.frames.drain(..consumed);
                self.position -= consumed as f64;
            }
        }
    }

    fn frame_at(&self, index: isize) -> [f32; 2] {
        if index < 0 {
            self.history
        } else {
            self.frames[index as usize]
        }
    }
}

#[inline]
fn catmull_rom(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    0.5 * ((2.0 * p1)
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine_stereo(frames: usize, frequency: f32, rate: f32) -> Vec<f32> {
        let mut data = Vec::with_capacity(frames * 2);
        for i in 0..frames {
            let value = (2.0 * std::f32::consts::PI * frequency * i as f32 / rate).sin();
            data.push(value);
            data.push(value);
        }
        data
    }

    #[test]
    fn unity_ratio_is_passthrough() {
        let input = sine_stereo(1000, 440.0, 48_000.0);
        let mut resampler = StereoResampler::new(48_000, 48_000);
        let mut output = Vec::new();
        resampler.process(&input, &mut output);
        assert_eq!(output.len(), input.len());
        assert!(output.iter().zip(&input).all(|(a, b)| (a - b).abs() < 1e-6));
    }

    #[test]
    fn conversion_length_tracks_ratio() {
        let frames = 44_100;
        let input = sine_stereo(frames, 440.0, 44_100.0);
        let mut resampler = StereoResampler::new(44_100, 48_000);
        let mut output = Vec::new();

        // Beri dua chunk agar state antar-call ikut teruji.
        resampler.process(&input[..input.len() / 2], &mut output);
        resampler.process(&input[input.len() / 2..], &mut output);

        let produced_frames = output.len() / 2;
        assert!(
            (produced_frames as f64 - 48_000.0).abs() < 64.0,
            "{produced_frames}"
        );
        assert!(output.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn speed_scales_output_length() {
        let frames = 48_000;
        let input = sine_stereo(frames, 440.0, 48_000.0);
        let mut resampler = StereoResampler::new(48_000, 48_000);
        resampler.set_speed(1.25);
        let mut output = Vec::new();
        resampler.process(&input, &mut output);

        let produced_frames = output.len() / 2;
        assert!(
            (produced_frames as f64 - 38_400.0).abs() < 64.0,
            "{produced_frames}"
        );
    }

    #[test]
    fn output_stays_bounded_for_loud_input() {
        let input = vec![1.0_f32; 4800];
        let mut resampler = StereoResampler::new(48_000, 44_100);
        let mut output = Vec::new();
        resampler.process(&input, &mut output);
        assert!(output.iter().all(|sample| sample.abs() < 1.2));
    }
}

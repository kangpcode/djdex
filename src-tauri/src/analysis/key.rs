//! Deteksi key (Krumhansl-Schmuckler) dan pemetaan Camelot.
//!
//! Chroma dibangun dari FFT per frame (Hann, 4096 sample) pada audio mono
//! hasil downmix/downsample. Setiap bin 55–2000 Hz dipetakan ke pitch class,
//! lalu chroma dikorelasikan (Pearson) dengan profil major/minor Krumhansl
//! untuk 12 root. Nilai terbaik menghasilkan nama key + kode Camelot.
//!
//! FFT hanya berjalan di thread analisis offline, bukan audio callback.

use rustfft::num_complex::Complex32;
use rustfft::FftPlanner;
use serde::Serialize;

const FRAME: usize = 4096;
const HOP: usize = 2048;

const MAJOR_PROFILE: [f32; 12] = [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE: [f32; 12] = [
    6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

const NOTE_NAMES: [&str; 12] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];
/// Camelot untuk root chromatic 0..11 pada mode major (B) dan minor (A).
const CAMELOT_MAJOR: [u8; 12] = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR: [u8; 12] = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

/// Hasil deteksi key.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyEstimate {
    /// Contoh: `"A minor"`, `"C major"`.
    pub key_name: String,
    /// Contoh: `"8A"`.
    pub camelot: String,
    pub confidence: f32,
}

/// Deteksi key dari mono PCM. `None` bila audio terlalu pendek atau senyap.
pub fn estimate_key(mono: &[f32], sample_rate: u32) -> Option<KeyEstimate> {
    if sample_rate == 0 || mono.len() < FRAME {
        return None;
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FRAME);
    let mut buffer = vec![Complex32::new(0.0, 0.0); FRAME];
    let mut chroma = [0.0_f32; 12];
    let mut frames_used = 0_usize;
    let mut pos = 0_usize;

    while pos + FRAME <= mono.len() {
        for (index, slot) in buffer.iter_mut().enumerate() {
            let window =
                0.5 - 0.5 * (2.0 * std::f32::consts::PI * index as f32 / FRAME as f32).cos();
            *slot = Complex32::new(mono[pos + index] * window, 0.0);
        }
        fft.process(&mut buffer);

        let mut frame_chroma = [0.0_f32; 12];
        let mut frame_energy = 0.0_f32;

        for (bin, value) in buffer.iter().enumerate().take(FRAME / 2).skip(1) {
            let frequency = bin as f32 * sample_rate as f32 / FRAME as f32;
            if !(55.0..=2_000.0).contains(&frequency) {
                continue;
            }

            let power = value.norm_sqr();
            if power <= 0.0 {
                continue;
            }

            let midi = 69.0 + 12.0 * (frequency / 440.0).log2();
            let pitch_class = (midi.round() as i32).rem_euclid(12) as usize;
            // Tilt 1/sqrt(f) menyeimbangkan energi bass yang dominan.
            frame_chroma[pitch_class] += power / frequency.sqrt();
            frame_energy += power;
        }

        if frame_energy > 1e-9 {
            let total: f32 = frame_chroma.iter().sum();
            if total > 1e-9 {
                for (accumulated, value) in chroma.iter_mut().zip(frame_chroma) {
                    *accumulated += value / total;
                }
                frames_used += 1;
            }
        }

        pos += HOP;
    }

    let mean = chroma.iter().sum::<f32>() / 12.0;
    if frames_used == 0 || mean <= 1e-9 {
        return None;
    }

    let mut best: Option<(usize, bool, f32)> = None;
    let mut second_best = f32::NEG_INFINITY;

    for root in 0..12 {
        for minor in [false, true] {
            let profile = if minor {
                &MINOR_PROFILE
            } else {
                &MAJOR_PROFILE
            };
            let score = pearson_for_root(&chroma, root, profile);
            if score.is_finite() {
                match best {
                    Some((_, _, best_score)) if score <= best_score => {
                        second_best = second_best.max(score);
                    }
                    _ => {
                        if let Some((_, _, previous_best)) = best {
                            second_best = second_best.max(previous_best);
                        }
                        best = Some((root, minor, score));
                    }
                }
            }
        }
    }

    let (root, minor, score) = best?;
    if !score.is_finite() || score <= 0.0 {
        return None;
    }

    let mode = if minor { "minor" } else { "major" };
    let camelot_number = if minor {
        CAMELOT_MINOR[root]
    } else {
        CAMELOT_MAJOR[root]
    };
    let suffix = if minor { 'A' } else { 'B' };
    let spread = (score - second_best).max(0.0);

    Some(KeyEstimate {
        key_name: format!("{} {mode}", NOTE_NAMES[root]),
        camelot: format!("{camelot_number}{suffix}"),
        confidence: (spread / score.abs().max(1e-6)).clamp(0.0, 1.0),
    })
}

/// Korelasi Pearson antara chroma yang dirotasi ke root tertentu dan profil.
fn pearson_for_root(chroma: &[f32; 12], root: usize, profile: &[f32; 12]) -> f32 {
    let mut rotated = [0.0_f32; 12];
    for index in 0..12 {
        rotated[index] = chroma[(root + index) % 12];
    }

    let chroma_mean = rotated.iter().sum::<f32>() / 12.0;
    let profile_mean = profile.iter().sum::<f32>() / 12.0;

    let mut numerator = 0.0_f32;
    let mut chroma_var = 0.0_f32;
    let mut profile_var = 0.0_f32;

    for index in 0..12 {
        let chroma_delta = rotated[index] - chroma_mean;
        let profile_delta = profile[index] - profile_mean;
        numerator += chroma_delta * profile_delta;
        chroma_var += chroma_delta * chroma_delta;
        profile_var += profile_delta * profile_delta;
    }

    numerator / (chroma_var.sqrt() * profile_var.sqrt() + 1e-9)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chords(notes: &[(f32, f32)], seconds: f32, sample_rate: u32) -> Vec<f32> {
        let frames = (seconds * sample_rate as f32) as usize;
        let mut mono = vec![0.0_f32; frames];
        for &(frequency, amplitude) in notes {
            for (index, sample) in mono.iter_mut().enumerate() {
                let phase =
                    2.0 * std::f32::consts::PI * frequency * index as f32 / sample_rate as f32;
                *sample += phase.sin() * amplitude;
            }
        }
        mono
    }

    #[test]
    fn detects_c_major_camelot_8b() {
        // C4, E4, G4.
        let mono = chords(
            &[(261.63, 0.25), (329.63, 0.25), (392.0, 0.25)],
            3.0,
            11_025,
        );
        let estimate = estimate_key(&mono, 11_025).expect("key terdeteksi");
        assert_eq!(estimate.camelot, "8B", "{}", estimate.key_name);
        assert!(estimate.key_name.ends_with("major"));
        assert!(estimate.confidence > 0.0);
    }

    #[test]
    fn detects_a_minor_camelot_8a() {
        // A3, C4, E4.
        let mono = chords(
            &[(220.0, 0.25), (261.63, 0.25), (329.63, 0.25)],
            3.0,
            11_025,
        );
        let estimate = estimate_key(&mono, 11_025).expect("key terdeteksi");
        assert_eq!(estimate.camelot, "8A", "{}", estimate.key_name);
        assert!(estimate.key_name.ends_with("minor"));
    }

    #[test]
    fn silence_has_no_key() {
        let mono = vec![0.0_f32; 11_025 * 2];
        assert!(estimate_key(&mono, 11_025).is_none());
    }
}

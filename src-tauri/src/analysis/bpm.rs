//! Estimasi BPM dan beatgrid dari envelope onset.
//!
//! Alur:
//! 1. Energi per frame (128 sample, hop 64) → envelope onset (selisih positif).
//! 2. Autokorelasi envelope untuk periode beat (60–200 BPM), dengan interpolasi
//!    parabolik agar resolusi sub-frame.
//! 3. Fold tempo ke rentang 70–180 BPM untuk menghindari kesalahan oktaf.
//! 4. Estimasi fase beat pertama dengan menjumlah onset pada grid beat.
//!
//! Analisis berjalan di thread worker (bukan callback audio), jadi alokasi
//! `Vec` aman.

use serde::Serialize;

/// Frame energi (sample) dan hop-nya.
const ENV_FRAME: usize = 128;
const ENV_HOP: usize = 64;
const MIN_BPM: f64 = 60.0;
const MAX_BPM: f64 = 200.0;
/// Rentang tempo final yang ditampilkan (standar DJ).
const FOLD_MIN: f64 = 70.0;
const FOLD_MAX: f64 = 180.0;

/// Hasil estimasi tempo + posisi beat pertama.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BpmEstimate {
    pub bpm: f64,
    pub confidence: f32,
    /// Waktu beat pertama (detik) dari awal track.
    pub first_beat_secs: f64,
}

/// Estimasi BPM dari mono PCM. `None` bila audio terlalu pendek/senyap atau
/// tidak ada periodisitas yang meyakinkan.
pub fn estimate_bpm(mono: &[f32], sample_rate: u32) -> Option<BpmEstimate> {
    if sample_rate == 0 || mono.len() < ENV_FRAME * 8 {
        return None;
    }

    // 1. Envelope energi (RMS per frame).
    let mut energy = Vec::with_capacity(mono.len() / ENV_HOP + 1);
    let mut pos = 0;
    while pos + ENV_FRAME <= mono.len() {
        let mut sum = 0.0_f32;
        for sample in &mono[pos..pos + ENV_FRAME] {
            sum += sample * sample;
        }
        energy.push((sum / ENV_FRAME as f32).sqrt());
        pos += ENV_HOP;
    }
    if energy.len() < 16 {
        return None;
    }

    // 2. Onset = kenaikan energi; turunkan DC agar autokorelasi bersih.
    let mut onset = Vec::with_capacity(energy.len());
    // Frame pertama dianggap onset: track yang dimulai tepat di beat tidak
    // kehilangan beat pertamanya saat estimasi fase.
    onset.push(energy[0].max(0.0));
    for index in 1..energy.len() {
        onset.push((energy[index] - energy[index - 1]).max(0.0));
    }
    let mean = onset.iter().sum::<f32>() / onset.len() as f32;
    if mean <= 1e-7 {
        return None;
    }
    for value in &mut onset {
        *value = (*value - mean * 0.5).max(0.0);
    }

    let envelope_rate = f64::from(sample_rate) / ENV_HOP as f64;
    let min_lag = ((envelope_rate * 60.0 / MAX_BPM).floor() as usize).max(1);
    let max_lag = ((envelope_rate * 60.0 / MIN_BPM).ceil() as usize).min(onset.len() - 2);
    if max_lag <= min_lag {
        return None;
    }

    // 3. Autokorelasi ternormalisasi jumlah sampel.
    let mut scores = vec![0.0_f32; max_lag + 2];
    for lag in min_lag..=max_lag {
        let mut sum = 0.0_f64;
        let count = onset.len() - lag;
        for index in 0..count {
            sum += f64::from(onset[index + lag]) * f64::from(onset[index]);
        }
        scores[lag] = (sum / count as f64) as f32;
    }

    let (mut best_lag, mut best_score) = (min_lag, 0.0_f32);
    for (lag, score) in scores.iter().enumerate().take(max_lag + 1).skip(min_lag) {
        if *score > best_score {
            best_score = *score;
            best_lag = lag;
        }
    }
    if best_score <= 0.0 {
        return None;
    }

    // Interpolasi parabolik di sekitar puncak.
    let (left, center, right) = (scores[best_lag - 1], scores[best_lag], scores[best_lag + 1]);
    let denominator = left - 2.0 * center + right;
    let delta = if denominator.abs() > 1e-12 {
        (0.5 * (left - right) / denominator).clamp(-1.0, 1.0)
    } else {
        0.0
    };
    let lag = best_lag as f64 + f64::from(delta);
    let mut bpm = 60.0 * envelope_rate / lag;

    // Fold ke rentang tampilan; beat tetap periodik sehingga BPM ×2/÷2 valid.
    while bpm < FOLD_MIN {
        bpm *= 2.0;
    }
    while bpm > FOLD_MAX {
        bpm /= 2.0;
    }
    if !bpm.is_finite() || bpm <= 0.0 {
        return None;
    }

    // 4. Fase beat: jumlah onset pada setiap grid beat.
    let beat_frames = 60.0 / bpm * envelope_rate;
    let steps = beat_frames.ceil().max(1.0) as usize;
    let mut best_phase = 0.0_f64;
    let mut best_phase_score = f32::NEG_INFINITY;

    for step in 0..steps {
        let phase = step as f64;
        let mut cursor = phase;
        let mut sum = 0.0_f32;
        let mut count = 0_usize;
        while (cursor as usize) < onset.len() {
            sum += onset[cursor as usize];
            count += 1;
            cursor += beat_frames;
        }
        if count > 0 {
            let average = sum / count as f32;
            if average > best_phase_score {
                best_phase_score = average;
                best_phase = phase;
            }
        }
    }

    let scores_mean =
        scores[min_lag..=max_lag].iter().sum::<f32>() / (max_lag - min_lag + 1) as f32;
    let confidence = if scores_mean > 1e-9 {
        ((best_score / scores_mean - 1.0) / 3.0).clamp(0.0, 1.0)
    } else {
        0.0
    };

    // Kompensasi latensi deteksi: onset baru terdeteksi pada akhir frame
    // energi, jadi waktu beat memakai ujung frame, lalu dinormalisasi ke
    // dalam satu interval beat.
    let beat_interval = 60.0 / bpm;
    let first_beat_secs = ((best_phase * ENV_HOP as f64 + ENV_FRAME as f64)
        / f64::from(sample_rate))
    .rem_euclid(beat_interval);

    Some(BpmEstimate {
        bpm,
        confidence,
        first_beat_secs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Click track sintetis: burst 1 kHz 5 ms pada setiap beat.
    fn click_track(bpm: f64, seconds: f64, sample_rate: u32) -> Vec<f32> {
        let frames = (seconds * f64::from(sample_rate)) as usize;
        let mut mono = vec![0.0_f32; frames];
        let interval = (60.0 / bpm * f64::from(sample_rate)) as usize;
        let click_frames = (0.005 * f64::from(sample_rate)) as usize;

        let mut beat = 0;
        while beat * interval + click_frames < frames {
            let start = beat * interval;
            for index in 0..click_frames {
                let t = index as f32 / sample_rate as f32;
                let decay = (-t * 400.0).exp();
                mono[start + index] = (2.0 * std::f32::consts::PI * 1_000.0 * t).sin() * decay;
            }
            beat += 1;
        }

        mono
    }

    #[test]
    fn detects_house_tempo() {
        let mono = click_track(128.0, 8.0, 11_025);
        let estimate = estimate_bpm(&mono, 11_025).expect("bpm terdeteksi");
        assert!((estimate.bpm - 128.0).abs() < 1.5, "bpm = {}", estimate.bpm);
        assert!(
            estimate.first_beat_secs < 0.06,
            "beat pertama = {}",
            estimate.first_beat_secs
        );
        assert!(estimate.confidence > 0.2, "{}", estimate.confidence);
    }

    #[test]
    fn detects_slow_tempo_without_octave_error() {
        let mono = click_track(90.0, 8.0, 11_025);
        let estimate = estimate_bpm(&mono, 11_025).expect("bpm terdeteksi");
        assert!((estimate.bpm - 90.0).abs() < 1.5, "bpm = {}", estimate.bpm);
    }

    #[test]
    fn silence_has_no_tempo() {
        let mono = vec![0.0_f32; 11_025 * 4];
        assert!(estimate_bpm(&mono, 11_025).is_none());
    }
}

//! Analisis waveform: min/max per bucket waktu untuk overview waveform.
//!
//! Analisis berjalan di thread terpisah dari playback dan bisa dibatalkan
//! dengan membandingkan token track id (jika user memuat track lain).

use serde::Serialize;

/// Resolusi default: 120 bucket per detik (cukup untuk zoom mendatang).
pub const DEFAULT_BUCKETS_PER_SECOND: u32 = 120;

/// Hasil analisis waveform penuh (resolusi tinggi).
#[derive(Debug, Clone)]
pub struct Waveform {
    pub duration_secs: f64,
    /// Pasangan `[min, max]` per bucket, nilai ternormalisasi -1..1.
    pub peaks: Vec<[f32; 2]>,
}

/// DTO kompak untuk frontend (pasangan min/max diratakan).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformDto {
    pub track_id: u64,
    pub duration_secs: f64,
    pub peaks: Vec<f32>,
}

impl Waveform {
    /// Downsample ke maksimum `max_points` bucket agar payload IPC ringan.
    pub fn to_dto(&self, track_id: u64, max_points: usize) -> WaveformDto {
        let max_points = max_points.max(1);
        let step = self.peaks.len().div_ceil(max_points).max(1);
        let mut peaks = Vec::with_capacity((self.peaks.len() / step + 1) * 2);

        for group in self.peaks.chunks(step) {
            let mut min = f32::INFINITY;
            let mut max = f32::NEG_INFINITY;
            for [bucket_min, bucket_max] in group {
                min = min.min(*bucket_min);
                max = max.max(*bucket_max);
            }
            if min.is_finite() && max.is_finite() {
                peaks.push(min);
                peaks.push(max);
            }
        }

        WaveformDto {
            track_id,
            duration_secs: self.duration_secs,
            peaks,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downsample_respects_max_points_and_extrema() {
        let waveform = Waveform {
            duration_secs: 10.0,
            peaks: (0..1000)
                .map(|i| {
                    let value = (i as f32 / 1000.0) * 2.0 - 1.0;
                    [value, value + 0.1]
                })
                .collect(),
        };

        let dto = waveform.to_dto(7, 100);
        assert_eq!(dto.track_id, 7);
        assert_eq!(dto.peaks.len(), 200);
        assert!(dto.peaks[0] <= -0.99);
        assert!(dto.peaks[1] >= -0.9);
        assert!(dto.peaks[dto.peaks.len() - 1] >= 0.99);
    }

    #[test]
    fn downsample_keeps_small_waveform_intact() {
        let waveform = Waveform {
            duration_secs: 1.0,
            peaks: vec![[-0.5, 0.5], [-0.25, 0.75]],
        };
        let dto = waveform.to_dto(1, 4096);
        assert_eq!(dto.peaks, vec![-0.5, 0.5, -0.25, 0.75]);
    }
}

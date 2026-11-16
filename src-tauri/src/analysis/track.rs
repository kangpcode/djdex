//! Analisis track lengkap untuk deck: waveform + BPM/beatgrid + key.
//!
//! Satu kali decode menghasilkan ketiganya, agar file tidak dibaca dua kali.
//! Waveform tetap pada sample rate sumber; BPM/key memakai mono hasil downmix
//! dan decimasi (box average) ke ±11 kHz. Analisis dibatasi 15 menit pertama
//! untuk menjaga pemakaian memori pada DJ set yang sangat panjang.
//!
//! Fungsi ini berjalan di thread analisis dan bisa dibatalkan lewat token track.

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::analysis::bpm::estimate_bpm;
use crate::analysis::key::estimate_key;
use crate::analysis::waveform::{Waveform, DEFAULT_BUCKETS_PER_SECOND};
use crate::audio::decoder::TrackDecoder;
use crate::error::AudioError;

/// Sample rate target untuk BPM/key (bukan sample rate playback).
const ANALYSIS_RATE: u32 = 11_025;
/// Batas durasi audio yang dianalisis untuk BPM/key.
const MAX_ANALYSIS_SECONDS: f64 = 900.0;

/// Hasil analisis musikal satu track.
#[derive(Debug, Clone, Default)]
pub struct TrackAnalysis {
    pub bpm: f64,
    pub bpm_confidence: f32,
    pub first_beat_secs: f64,
    pub key_name: Option<String>,
    pub camelot: Option<String>,
    pub key_confidence: f32,
}

/// Analisis satu file audio. `cancel_token` berisi track id aktif; hasil
/// dibuang bila nilainya berubah (track lain sudah dimuat).
pub fn analyze(
    path: &Path,
    cancel_token: &AtomicU64,
    track_id: u64,
) -> Result<Option<(Waveform, TrackAnalysis)>, AudioError> {
    if cancel_token.load(Ordering::Relaxed) != track_id {
        return Ok(None);
    }

    let mut decoder = TrackDecoder::open(path)?;
    let info = decoder.info().clone();
    let channels = usize::from(info.channels.max(1));
    let source_rate = info.source_sample_rate;
    if source_rate == 0 {
        return Ok(None);
    }

    let bucket_frames = (source_rate / DEFAULT_BUCKETS_PER_SECOND).max(1) as usize;
    let decimation = (source_rate / ANALYSIS_RATE).max(1) as usize;
    let analysis_rate = source_rate / decimation as u32;
    let max_mono_samples = (MAX_ANALYSIS_SECONDS * f64::from(analysis_rate)) as usize;

    let mut peaks: Vec<[f32; 2]> = Vec::new();
    let mut bucket_min = 0.0_f32;
    let mut bucket_max = 0.0_f32;
    let mut bucket_count = 0_usize;

    let mut mono: Vec<f32> = Vec::with_capacity(1_000_000);
    let mut mono_sum = 0.0_f32;
    let mut mono_count = 0_usize;

    let mut total_frames = 0_u64;
    let mut chunk = Vec::with_capacity(32_768);

    loop {
        if cancel_token.load(Ordering::Relaxed) != track_id {
            return Ok(None);
        }

        if !decoder.decode_next(&mut chunk)? {
            break;
        }

        for frame in chunk.chunks_exact(channels) {
            let sample = if channels >= 2 {
                0.5 * (frame[0] + frame[1])
            } else {
                frame[0]
            };

            if bucket_count == 0 {
                bucket_min = sample;
                bucket_max = sample;
            } else {
                bucket_min = bucket_min.min(sample);
                bucket_max = bucket_max.max(sample);
            }
            bucket_count += 1;

            if bucket_count >= bucket_frames {
                peaks.push([bucket_min, bucket_max]);
                bucket_count = 0;
            }

            if mono.len() < max_mono_samples {
                mono_sum += sample;
                mono_count += 1;
                if mono_count == decimation {
                    mono.push(mono_sum / decimation as f32);
                    mono_sum = 0.0;
                    mono_count = 0;
                }
            }

            total_frames += 1;
        }
    }

    if bucket_count > 0 {
        peaks.push([bucket_min, bucket_max]);
    }

    if total_frames == 0 {
        return Ok(None);
    }

    // Sisa sampel decimasi terakhir.
    if mono_count > 0 && mono.len() < max_mono_samples {
        mono.push(mono_sum / mono_count as f32);
    }

    let duration_secs = total_frames as f64 / f64::from(source_rate);
    let waveform = Waveform {
        duration_secs,
        peaks,
    };

    let mut analysis = TrackAnalysis::default();

    if let Some(bpm) = estimate_bpm(&mono, analysis_rate) {
        analysis.bpm = bpm.bpm;
        analysis.bpm_confidence = bpm.confidence;
        analysis.first_beat_secs = bpm.first_beat_secs;
    }

    if let Some(key) = estimate_key(&mono, analysis_rate) {
        analysis.key_name = Some(key.key_name);
        analysis.camelot = Some(key.camelot);
        analysis.key_confidence = key.confidence;
    }

    Ok(Some((waveform, analysis)))
}

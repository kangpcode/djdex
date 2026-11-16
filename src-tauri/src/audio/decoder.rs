//! Decoder streaming berbasis Symphonia.
//!
//! Semua fungsi di modul ini dipanggil dari worker thread (bukan callback
//! audio), jadi alokasi dan I/O file diperbolehkan.

use std::fs::File;
use std::io::ErrorKind;
use std::path::Path;

use serde::Serialize;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

use crate::error::AudioError;

/// Metadata teknis track yang dibutuhkan deck dan UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub file_name: String,
    pub codec: String,
    pub duration_secs: f64,
    pub source_sample_rate: u32,
    pub channels: u16,
}

/// Decoder audio satu track (interleaved f32 pada sample rate sumber).
pub struct TrackDecoder {
    reader: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    info: TrackInfo,
    eof: bool,
}

impl TrackDecoder {
    /// Buka file dan siapkan decoder untuk track audio default.
    pub fn open(path: &Path) -> Result<Self, AudioError> {
        let file = File::open(path)
            .map_err(|err| AudioError::TrackOpen(format!("{}: {err}", path.display())))?;
        let stream = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
            hint.with_extension(extension);
        }

        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                stream,
                &FormatOptions::default(),
                &MetadataOptions::default(),
            )
            .map_err(|err| AudioError::TrackOpen(format!("format tidak dikenali: {err}")))?;

        let reader = probed.format;
        let track = reader
            .default_track()
            .ok_or_else(|| AudioError::TrackOpen("tidak ada track audio".to_string()))?;

        if track.codec_params.codec == CODEC_TYPE_NULL {
            return Err(AudioError::TrackOpen(
                "codec audio tidak didukung build ini".to_string(),
            ));
        }

        let track_id = track.id;
        let codec_params = track.codec_params.clone();
        let sample_rate = codec_params
            .sample_rate
            .ok_or_else(|| AudioError::TrackOpen("sample rate tidak diketahui".to_string()))?;
        let channels = codec_params
            .channels
            .map(|layout| layout.count() as u16)
            .unwrap_or(2)
            .max(1);
        let duration_secs = codec_params
            .n_frames
            .map(|frames| frames as f64 / f64::from(sample_rate))
            .unwrap_or(0.0);

        let decoder = symphonia::default::get_codecs()
            .make(&codec_params, &DecoderOptions::default())
            .map_err(|err| AudioError::TrackOpen(format!("decoder tidak tersedia: {err}")))?;

        let file_name = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string());
        let codec = path
            .extension()
            .map(|ext| ext.to_string_lossy().to_uppercase())
            .unwrap_or_else(|| "AUDIO".to_string());

        Ok(Self {
            reader,
            decoder,
            track_id,
            info: TrackInfo {
                file_name,
                codec,
                duration_secs,
                source_sample_rate: sample_rate,
                channels,
            },
            eof: false,
        })
    }

    pub fn info(&self) -> &TrackInfo {
        &self.info
    }

    /// Decode paket berikutnya ke `out` (interleaved f32, sample rate sumber).
    /// Mengembalikan `false` saat end-of-stream.
    pub fn decode_next(&mut self, out: &mut Vec<f32>) -> Result<bool, AudioError> {
        out.clear();
        if self.eof {
            return Ok(false);
        }

        loop {
            let packet = match self.reader.next_packet() {
                Ok(packet) => packet,
                Err(SymphoniaError::IoError(err)) if err.kind() == ErrorKind::UnexpectedEof => {
                    self.eof = true;
                    return Ok(false);
                }
                Err(SymphoniaError::ResetRequired) => {
                    return Err(AudioError::TrackDecode(
                        "stream meminta reset (track berubah)".to_string(),
                    ));
                }
                Err(err) => return Err(AudioError::TrackDecode(err.to_string())),
            };

            if packet.track_id() != self.track_id {
                continue;
            }

            match self.decoder.decode(&packet) {
                Ok(decoded) => {
                    let spec = *decoded.spec();
                    let mut buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                    buffer.copy_interleaved_ref(decoded);
                    out.extend_from_slice(buffer.samples());
                    return Ok(!out.is_empty());
                }
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(SymphoniaError::IoError(err)) if err.kind() == ErrorKind::UnexpectedEof => {
                    self.eof = true;
                    return Ok(false);
                }
                Err(err) => return Err(AudioError::TrackDecode(err.to_string())),
            }
        }
    }

    /// Seek ke detik tertentu lalu reset decoder (wajib setelah seek).
    pub fn seek(&mut self, seconds: f64) -> Result<(), AudioError> {
        let seconds = seconds.max(0.0);
        let time = Time::from(seconds);

        self.reader
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time,
                    track_id: Some(self.track_id),
                },
            )
            .map_err(|err| AudioError::TrackSeek(err.to_string()))?;

        self.decoder.reset();
        self.eof = false;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    /// Tulis WAV PCM16 stereo kecil untuk pengujian decoder tanpa aset biner.
    fn write_test_wav(path: &Path, seconds: f32, rate: u32, frequency: f32) {
        let frames = (seconds * rate as f32) as u32;
        let channels = 2_u16;
        let data_len = frames * u32::from(channels) * 2;
        let mut file = File::create(path).expect("buat wav");
        let mut header = Vec::with_capacity(44);
        header.extend_from_slice(b"RIFF");
        header.extend_from_slice(&(36 + data_len).to_le_bytes());
        header.extend_from_slice(b"WAVEfmt ");
        header.extend_from_slice(&16_u32.to_le_bytes());
        header.extend_from_slice(&1_u16.to_le_bytes());
        header.extend_from_slice(&channels.to_le_bytes());
        header.extend_from_slice(&rate.to_le_bytes());
        header.extend_from_slice(&(rate * u32::from(channels) * 2).to_le_bytes());
        header.extend_from_slice(&(channels * 2).to_le_bytes());
        header.extend_from_slice(&16_u16.to_le_bytes());
        header.extend_from_slice(b"data");
        header.extend_from_slice(&data_len.to_le_bytes());
        file.write_all(&header).expect("header wav");

        for index in 0..frames {
            let value =
                (2.0 * std::f32::consts::PI * frequency * index as f32 / rate as f32).sin() * 0.5;
            let sample = (value * f32::from(i16::MAX)) as i16;
            for _ in 0..channels {
                file.write_all(&sample.to_le_bytes()).expect("sample wav");
            }
        }
        file.flush().expect("flush wav");
    }

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("djdex-test-{}-{name}", std::process::id()))
    }

    #[test]
    fn opens_decodes_and_seeks_wav() {
        let path = temp_path("decode.wav");
        write_test_wav(&path, 2.0, 44_100, 440.0);

        let mut decoder = TrackDecoder::open(&path).expect("buka wav");
        let info = decoder.info().clone();
        assert_eq!(info.source_sample_rate, 44_100);
        assert_eq!(info.channels, 2);
        assert!((info.duration_secs - 2.0).abs() < 0.05, "{:?}", info);

        let mut samples = Vec::new();
        assert!(decoder.decode_next(&mut samples).expect("decode"));
        assert!(!samples.is_empty());
        assert!(samples.iter().all(|sample| sample.abs() <= 1.0));

        decoder.seek(1.0).expect("seek");
        assert!(decoder
            .decode_next(&mut samples)
            .expect("decode setelah seek"));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn waveform_analysis_matches_duration_and_buckets() {
        let path = temp_path("wave.wav");
        write_test_wav(&path, 1.0, 44_100, 440.0);

        let token = std::sync::atomic::AtomicU64::new(9);
        let (waveform, analysis) = crate::analysis::track::analyze(&path, &token, 9)
            .expect("analisis")
            .expect("ada hasil");

        assert!((waveform.duration_secs - 1.0).abs() < 0.05);
        assert!(analysis.bpm >= 0.0);
        // 44100 frame / (44100/120) = 120 bucket + satu bucket sisa parsial.
        assert!((120..=121).contains(&waveform.peaks.len()));
        assert!(waveform.peaks.iter().any(|[min, max]| (max - min) > 0.1));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn waveform_is_cancelled_when_track_changes() {
        let path = temp_path("cancel.wav");
        write_test_wav(&path, 1.0, 44_100, 220.0);

        let token = std::sync::atomic::AtomicU64::new(42);
        let result = crate::analysis::track::analyze(&path, &token, 43).expect("analisis");
        assert!(result.is_none());

        let _ = std::fs::remove_file(path);
    }
}

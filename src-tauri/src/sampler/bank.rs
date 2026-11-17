//! Manajemen Bank Sampler, 4 Bank kit bawaan, serta ekspor/impor sample pack (.zip + manifest).

use std::fs::File;
use std::io::{Cursor, Read, Write};
use std::path::Path;
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;

use crate::error::AudioError;
use super::pad::{PadDto, PadMode, SamplePad};
use super::synth::*;

pub const PADS_PER_BANK: usize = 16;
pub const BANK_COUNT: usize = 4;

/// Satu Bank berisi 16 pad.
#[derive(Clone)]
pub struct SampleBank {
    pub id: usize,
    pub name: String,
    pub pads: [SamplePad; PADS_PER_BANK],
}

impl SampleBank {
    pub fn new(id: usize, name: impl Into<String>) -> Self {
        let name = name.into();
        let pads: [SamplePad; PADS_PER_BANK] = std::array::from_fn(|i| {
            SamplePad::new(i, format!("Pad {}", i + 1), "#00e5ff")
        });
        Self { id, name, pads }
    }

    pub fn pad_dto_list(&self, playing_states: &[(bool, f32); PADS_PER_BANK]) -> Vec<PadDto> {
        self.pads
            .iter()
            .enumerate()
            .map(|(i, pad)| {
                let (is_playing, progress) = playing_states[i];
                PadDto {
                    id: pad.id,
                    name: pad.name.clone(),
                    color: pad.color.clone(),
                    mode: pad.mode,
                    volume: pad.volume,
                    pitch_semitones: pad.pitch_semitones,
                    mute_group: pad.mute_group,
                    sync_bpm: pad.sync_bpm,
                    base_bpm: pad.base_bpm,
                    quantize: pad.quantize,
                    loaded: pad.is_loaded(),
                    duration_secs: pad.duration_secs,
                    is_playing,
                    progress,
                }
            })
            .collect()
    }
}

/// Buat 4 Factory Bank standar (EDM, Hip-Hop 808, House, DJ Scratch & FX).
pub fn create_default_banks(sample_rate: u32) -> [SampleBank; BANK_COUNT] {
    let rate = sample_rate.max(44_100);

    // Bank A: EDM Festival
    let mut bank_a = SampleBank::new(0, "EDM Festival");
    bank_a.pads[0] = SamplePad::new(0, "Festival Kick", "#00e5ff")
        .with_audio("Festival Kick", "#00e5ff", synth_kick(rate, 0.35, 180.0, 48.0, 0.8), rate);
    bank_a.pads[1] = SamplePad::new(1, "Stadium Clap", "#00e5ff")
        .with_audio("Stadium Clap", "#00e5ff", synth_clap(rate, 0.28), rate);
    bank_a.pads[2] = SamplePad::new(2, "Closed Hat", "#00e5ff")
        .with_audio("Closed Hat", "#00e5ff", synth_hihat(rate, 0.05, true), rate);
    bank_a.pads[2].mute_group = Some(1);
    bank_a.pads[3] = SamplePad::new(3, "Open Hat", "#00e5ff")
        .with_audio("Open Hat", "#00e5ff", synth_hihat(rate, 0.30, true), rate);
    bank_a.pads[3].mute_group = Some(1);

    bank_a.pads[4] = SamplePad::new(4, "Big Snare", "#00e5ff")
        .with_audio("Big Snare", "#00e5ff", synth_snare(rate, 0.25, 190.0, 0.9), rate);
    bank_a.pads[5] = SamplePad::new(5, "Rave Stab Min", "#38bdf8")
        .with_audio("Rave Stab Min", "#38bdf8", synth_chord_stab(rate, 0.38, 220.0), rate);
    bank_a.pads[6] = SamplePad::new(6, "Heavy Tom", "#0284c7")
        .with_audio("Heavy Tom", "#0284c7", synth_tom(rate, 0.35, 260.0, 95.0), rate);
    bank_a.pads[7] = SamplePad::new(7, "Crash Cymbal", "#7dd3fc")
        .with_audio("Crash Cymbal", "#7dd3fc", synth_fx(rate, 0.60, 3), rate);

    bank_a.pads[8] = SamplePad::new(8, "Laser Zap", "#a855f7")
        .with_audio("Laser Zap", "#a855f7", synth_fx(rate, 0.22, 0), rate);
    bank_a.pads[9] = SamplePad::new(9, "Dub Siren", "#a855f7")
        .with_audio("Dub Siren", "#a855f7", synth_fx(rate, 0.55, 1), rate);
    bank_a.pads[10] = SamplePad::new(10, "Airhorn Blast", "#ec4899")
        .with_audio("Airhorn Blast", "#ec4899", synth_fx(rate, 0.45, 2), rate);
    bank_a.pads[11] = SamplePad::new(11, "DJ Chirp", "#f43f5e")
        .with_audio("DJ Chirp", "#f43f5e", synth_scratch(rate, 0.28, 1), rate);

    bank_a.pads[12] = SamplePad::new(12, "Impact Sub", "#06b6d4")
        .with_audio("Impact Sub", "#06b6d4", synth_kick(rate, 0.60, 110.0, 32.0, 0.3), rate);
    bank_a.pads[13] = SamplePad::new(13, "Snare Roll", "#06b6d4");
    bank_a.pads[13].mode = PadMode::Stutter;
    bank_a.pads[13].set_audio(synth_snare(rate, 0.15, 210.0, 0.8), rate);
    bank_a.pads[14] = SamplePad::new(14, "Loop Beat", "#14b8a6");
    bank_a.pads[14].mode = PadMode::Loop;
    bank_a.pads[14].set_audio(synth_scratch(rate, 0.50, 0), rate);
    bank_a.pads[15] = SamplePad::new(15, "Vinyl Cut", "#10b981")
        .with_audio("Vinyl Cut", "#10b981", synth_scratch(rate, 0.35, 2), rate);

    // Bank B: Hip-Hop 808
    let mut bank_b = SampleBank::new(1, "Hip-Hop 808");
    bank_b.pads[0] = SamplePad::new(0, "808 Sub Kick", "#ff007f")
        .with_audio("808 Sub Kick", "#ff007f", synth_kick(rate, 0.65, 130.0, 38.0, 0.5), rate);
    bank_b.pads[1] = SamplePad::new(1, "Crisp Trap Snare", "#ff007f")
        .with_audio("Crisp Trap Snare", "#ff007f", synth_snare(rate, 0.22, 220.0, 1.0), rate);
    bank_b.pads[2] = SamplePad::new(2, "Trap Hat Closed", "#ff007f")
        .with_audio("Trap Hat Closed", "#ff007f", synth_hihat(rate, 0.04, false), rate);
    bank_b.pads[2].mute_group = Some(1);
    bank_b.pads[3] = SamplePad::new(3, "Trap Hat Open", "#ff007f")
        .with_audio("Trap Hat Open", "#ff007f", synth_hihat(rate, 0.25, false), rate);
    bank_b.pads[3].mute_group = Some(1);

    bank_b.pads[4] = SamplePad::new(4, "808 Clap", "#fb7185")
        .with_audio("808 Clap", "#fb7185", synth_clap(rate, 0.22), rate);
    bank_b.pads[5] = SamplePad::new(5, "Rimshot Hit", "#f43f5e")
        .with_audio("Rimshot Hit", "#f43f5e", synth_tom(rate, 0.10, 480.0, 320.0), rate);
    bank_b.pads[6] = SamplePad::new(6, "Low 808 Tom", "#e11d48")
        .with_audio("Low 808 Tom", "#e11d48", synth_tom(rate, 0.40, 160.0, 65.0), rate);
    bank_b.pads[7] = SamplePad::new(7, "High 808 Tom", "#be123c")
        .with_audio("High 808 Tom", "#be123c", synth_tom(rate, 0.30, 290.0, 130.0), rate);

    bank_b.pads[8] = SamplePad::new(8, "Baby Scratch", "#f59e0b")
        .with_audio("Baby Scratch", "#f59e0b", synth_scratch(rate, 0.32, 0), rate);
    bank_b.pads[9] = SamplePad::new(9, "Forward Chirp", "#f59e0b")
        .with_audio("Forward Chirp", "#f59e0b", synth_scratch(rate, 0.26, 1), rate);
    bank_b.pads[10] = SamplePad::new(10, "Transform Cut", "#d97706")
        .with_audio("Transform Cut", "#d97706", synth_scratch(rate, 0.38, 2), rate);
    bank_b.pads[11] = SamplePad::new(11, "Trap Siren", "#b45309")
        .with_audio("Trap Siren", "#b45309", synth_fx(rate, 0.40, 1), rate);

    bank_b.pads[12] = SamplePad::new(12, "Gunshot FX", "#ef4444")
        .with_audio("Gunshot FX", "#ef4444", synth_snare(rate, 0.45, 140.0, 1.2), rate);
    bank_b.pads[13] = SamplePad::new(13, "Stutter Snare", "#ef4444");
    bank_b.pads[13].mode = PadMode::Stutter;
    bank_b.pads[13].set_audio(synth_snare(rate, 0.12, 230.0, 0.9), rate);
    bank_b.pads[14] = SamplePad::new(14, "Airhorn Shot", "#dc2626")
        .with_audio("Airhorn Shot", "#dc2626", synth_fx(rate, 0.35, 2), rate);
    bank_b.pads[15] = SamplePad::new(15, "Sub Boom", "#991b1b")
        .with_audio("Sub Boom", "#991b1b", synth_kick(rate, 0.80, 95.0, 28.0, 0.2), rate);

    // Bank C: House Classic
    let mut bank_c = SampleBank::new(2, "House Classic");
    bank_c.pads[0] = SamplePad::new(0, "909 Punch Kick", "#10b981")
        .with_audio("909 Punch Kick", "#10b981", synth_kick(rate, 0.32, 210.0, 52.0, 0.9), rate);
    bank_c.pads[1] = SamplePad::new(1, "909 Snare", "#10b981")
        .with_audio("909 Snare", "#10b981", synth_snare(rate, 0.24, 185.0, 0.85), rate);
    bank_c.pads[2] = SamplePad::new(2, "909 Closed Hat", "#10b981")
        .with_audio("909 Closed Hat", "#10b981", synth_hihat(rate, 0.05, true), rate);
    bank_c.pads[2].mute_group = Some(1);
    bank_c.pads[3] = SamplePad::new(3, "909 Open Hat", "#10b981")
        .with_audio("909 Open Hat", "#10b981", synth_hihat(rate, 0.28, true), rate);
    bank_c.pads[3].mute_group = Some(1);

    bank_c.pads[4] = SamplePad::new(4, "909 Clap", "#34d399")
        .with_audio("909 Clap", "#34d399", synth_clap(rate, 0.24), rate);
    bank_c.pads[5] = SamplePad::new(5, "Ride Cymbal", "#6ee7b7")
        .with_audio("Ride Cymbal", "#6ee7b7", synth_hihat(rate, 0.40, true), rate);
    bank_c.pads[6] = SamplePad::new(6, "House Conga Low", "#059669")
        .with_audio("House Conga Low", "#059669", synth_tom(rate, 0.25, 210.0, 110.0), rate);
    bank_c.pads[7] = SamplePad::new(7, "House Conga High", "#047857")
        .with_audio("House Conga High", "#047857", synth_tom(rate, 0.20, 360.0, 180.0), rate);

    bank_c.pads[8] = SamplePad::new(8, "House Chord Stab", "#06b6d4")
        .with_audio("House Chord Stab", "#06b6d4", synth_chord_stab(rate, 0.32, 261.63), rate);
    bank_c.pads[9] = SamplePad::new(9, "Acid Bass Stab", "#0891b2")
        .with_audio("Acid Bass Stab", "#0891b2", synth_tom(rate, 0.28, 140.0, 45.0), rate);
    bank_c.pads[10] = SamplePad::new(10, "White Noise Rise", "#0e7490")
        .with_audio("White Noise Rise", "#0e7490", synth_fx(rate, 0.50, 3), rate);
    bank_c.pads[11] = SamplePad::new(11, "Vinyl Scratch", "#6366f1")
        .with_audio("Vinyl Scratch", "#6366f1", synth_scratch(rate, 0.25, 1), rate);

    bank_c.pads[12] = SamplePad::new(12, "Shaker Loop", "#8b5cf6");
    bank_c.pads[12].mode = PadMode::Loop;
    bank_c.pads[12].set_audio(synth_clap(rate, 0.35), rate);
    bank_c.pads[13] = SamplePad::new(13, "Hold Vocal Stab", "#a855f7");
    bank_c.pads[13].mode = PadMode::Hold;
    bank_c.pads[13].set_audio(synth_chord_stab(rate, 0.60, 330.0), rate);
    bank_c.pads[14] = SamplePad::new(14, "Laser Drop", "#d946ef")
        .with_audio("Laser Drop", "#d946ef", synth_fx(rate, 0.20, 0), rate);
    bank_c.pads[15] = SamplePad::new(15, "Deep Club Sub", "#ec4899")
        .with_audio("Deep Club Sub", "#ec4899", synth_kick(rate, 0.50, 140.0, 42.0, 0.4), rate);

    // Bank D: DJ Scratch & Performance FX
    let mut bank_d = SampleBank::new(3, "DJ Scratches & FX");
    bank_d.pads[0] = SamplePad::new(0, "Baby Scratch A", "#eab308")
        .with_audio("Baby Scratch A", "#eab308", synth_scratch(rate, 0.30, 0), rate);
    bank_d.pads[1] = SamplePad::new(1, "Forward Chirp", "#eab308")
        .with_audio("Forward Chirp", "#eab308", synth_scratch(rate, 0.25, 1), rate);
    bank_d.pads[2] = SamplePad::new(2, "Transform Cut", "#ca8a04")
        .with_audio("Transform Cut", "#ca8a04", synth_scratch(rate, 0.35, 2), rate);
    bank_d.pads[3] = SamplePad::new(3, "Flare Scratch", "#a16207")
        .with_audio("Flare Scratch", "#a16207", synth_scratch(rate, 0.40, 3), rate);

    bank_d.pads[4] = SamplePad::new(4, "Airhorn Classic", "#f97316")
        .with_audio("Airhorn Classic", "#f97316", synth_fx(rate, 0.45, 2), rate);
    bank_d.pads[5] = SamplePad::new(5, "Dub Siren FX", "#ea580c")
        .with_audio("Dub Siren FX", "#ea580c", synth_fx(rate, 0.50, 1), rate);
    bank_d.pads[6] = SamplePad::new(6, "Laser Shot", "#c2410c")
        .with_audio("Laser Shot", "#c2410c", synth_fx(rate, 0.18, 0), rate);
    bank_d.pads[7] = SamplePad::new(7, "Explosion Crash", "#9a3412")
        .with_audio("Explosion Crash", "#9a3412", synth_fx(rate, 0.70, 3), rate);

    bank_d.pads[8] = SamplePad::new(8, "Stutter Scratch", "#84cc16");
    bank_d.pads[8].mode = PadMode::Stutter;
    bank_d.pads[8].set_audio(synth_scratch(rate, 0.18, 1), rate);
    bank_d.pads[9] = SamplePad::new(9, "Vinyl Spinback", "#65a30d")
        .with_audio("Vinyl Spinback", "#65a30d", synth_scratch(rate, 0.55, 0), rate);
    bank_d.pads[10] = SamplePad::new(10, "Hold Siren", "#4d7c0f");
    bank_d.pads[10].mode = PadMode::Hold;
    bank_d.pads[10].set_audio(synth_fx(rate, 0.80, 1), rate);
    bank_d.pads[11] = SamplePad::new(11, "Loop Vinyl Beat", "#3f6212");
    bank_d.pads[11].mode = PadMode::Loop;
    bank_d.pads[11].set_audio(synth_scratch(rate, 0.60, 2), rate);

    bank_d.pads[12] = SamplePad::new(12, "Battle Kick", "#06b6d4")
        .with_audio("Battle Kick", "#06b6d4", synth_kick(rate, 0.28, 175.0, 50.0, 0.9), rate);
    bank_d.pads[13] = SamplePad::new(13, "Battle Snare", "#06b6d4")
        .with_audio("Battle Snare", "#06b6d4", synth_snare(rate, 0.22, 200.0, 0.95), rate);
    bank_d.pads[14] = SamplePad::new(14, "Battle HiHat", "#0891b2")
        .with_audio("Battle HiHat", "#0891b2", synth_hihat(rate, 0.05, true), rate);
    bank_d.pads[15] = SamplePad::new(15, "Sub Drop FX", "#0e7490")
        .with_audio("Sub Drop FX", "#0e7490", synth_kick(rate, 0.75, 120.0, 26.0, 0.3), rate);

    [bank_a, bank_b, bank_c, bank_d]
}

/// Manifest JSON untuk ekspor/impor sample pack (.zip).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplePackManifest {
    pub name: String,
    pub version: String,
    pub author: String,
    pub bank_name: String,
    pub pads: Vec<ManifestPadEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestPadEntry {
    pub id: usize,
    pub name: String,
    pub color: String,
    pub mode: PadMode,
    pub volume: f32,
    pub pitch_semitones: f32,
    pub mute_group: Option<u8>,
    pub sync_bpm: bool,
    pub base_bpm: f32,
    pub quantize: bool,
    pub wav_file: Option<String>,
}

/// Ekspor satu bank sampler ke file sample pack (.zip).
pub fn export_sample_pack(bank: &SampleBank, destination_path: &Path) -> Result<(), AudioError> {
    let file = File::create(destination_path)
        .map_err(|e| AudioError::Io(format!("Gagal membuat file export: {e}")))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut manifest_entries = Vec::new();

    for pad in &bank.pads {
        let wav_filename = if pad.is_loaded() {
            Some(format!("pad_{:02}_{}.wav", pad.id, sanitize_filename(&pad.name)))
        } else {
            None
        };

        if let Some(ref fname) = wav_filename {
            // Encode audio stereo ke buffer WAV in-memory
            let wav_bytes = encode_wav(&pad.audio, pad.sample_rate)?;
            zip.start_file(fname, options)
                .map_err(|e| AudioError::Io(format!("Gagal menulis file WAV ke ZIP: {e}")))?;
            zip.write_all(&wav_bytes)
                .map_err(|e| AudioError::Io(format!("Gagal menulis byte WAV: {e}")))?;
        }

        manifest_entries.push(ManifestPadEntry {
            id: pad.id,
            name: pad.name.clone(),
            color: pad.color.clone(),
            mode: pad.mode,
            volume: pad.volume,
            pitch_semitones: pad.pitch_semitones,
            mute_group: pad.mute_group,
            sync_bpm: pad.sync_bpm,
            base_bpm: pad.base_bpm,
            quantize: pad.quantize,
            wav_file: wav_filename,
        });
    }

    let manifest = SamplePackManifest {
        name: format!("DJDeX Pack - {}", bank.name),
        version: "1.0.0".to_string(),
        author: "Kangpcode".to_string(),
        bank_name: bank.name.clone(),
        pads: manifest_entries,
    };

    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| AudioError::Serialize(e.to_string()))?;

    zip.start_file("manifest.json", options)
        .map_err(|e| AudioError::Io(format!("Gagal menulis manifest.json ke ZIP: {e}")))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| AudioError::Io(format!("Gagal menulis data manifest: {e}")))?;

    zip.finish()
        .map_err(|e| AudioError::Io(format!("Gagal menyelesaikan file ZIP: {e}")))?;

    Ok(())
}

/// Impor sample pack dari file .zip ke target bank.
pub fn import_sample_pack(zip_path: &Path, bank: &mut SampleBank) -> Result<(), AudioError> {
    let file = File::open(zip_path)
        .map_err(|e| AudioError::Io(format!("Gagal membuka file ZIP: {e}")))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| AudioError::Io(format!("Format ZIP tidak valid: {e}")))?;

    // Baca manifest.json
    let mut manifest_file = archive
        .by_name("manifest.json")
        .map_err(|_| AudioError::Io("manifest.json tidak ditemukan di dalam pack".to_string()))?;
    let mut manifest_str = String::new();
    manifest_file
        .read_to_string(&mut manifest_str)
        .map_err(|e| AudioError::Io(format!("Gagal membaca manifest.json: {e}")))?;
    drop(manifest_file);

    let manifest: SamplePackManifest = serde_json::from_str(&manifest_str)
        .map_err(|e| AudioError::Serialize(format!("Format manifest.json salah: {e}")))?;

    if !manifest.bank_name.is_empty() {
        bank.name = manifest.bank_name;
    }

    for entry in manifest.pads {
        if entry.id >= PADS_PER_BANK {
            continue;
        }
        let pad = &mut bank.pads[entry.id];
        pad.name = entry.name;
        pad.color = entry.color;
        pad.mode = entry.mode;
        pad.volume = entry.volume;
        pad.pitch_semitones = entry.pitch_semitones;
        pad.mute_group = entry.mute_group;
        pad.sync_bpm = entry.sync_bpm;
        pad.base_bpm = entry.base_bpm;
        pad.quantize = entry.quantize;

        if let Some(ref wav_name) = entry.wav_file {
            if let Ok(mut wav_file) = archive.by_name(wav_name) {
                let mut wav_bytes = Vec::new();
                if wav_file.read_to_end(&mut wav_bytes).is_ok() {
                    if let Ok((samples, rate)) = decode_wav(&wav_bytes) {
                        pad.set_audio(samples, rate);
                    }
                }
            }
        }
    }

    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect()
}

fn encode_wav(samples: &[f32], sample_rate: u32) -> Result<Vec<u8>, AudioError> {
    let spec = hound::WavSpec {
        channels: 2,
        sample_rate: sample_rate.max(44_100),
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::new());
    let mut writer = hound::WavWriter::new(&mut cursor, spec)
        .map_err(|e| AudioError::Io(format!("Gagal inisialisasi WAV writer: {e}")))?;

    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let s_i16 = (clamped * 32767.0) as i16;
        writer
            .write_sample(s_i16)
            .map_err(|e| AudioError::Io(format!("Gagal menulis sampel WAV: {e}")))?;
    }
    writer
        .finalize()
        .map_err(|e| AudioError::Io(format!("Gagal finalisasi WAV writer: {e}")))?;

    Ok(cursor.into_inner())
}

fn decode_wav(bytes: &[u8]) -> Result<(Vec<f32>, u32), AudioError> {
    let cursor = Cursor::new(bytes);
    let mut reader = hound::WavReader::new(cursor)
        .map_err(|e| AudioError::Io(format!("Format WAV rusak: {e}")))?;
    let spec = reader.spec();
    let channels = spec.channels as usize;
    let sample_rate = spec.sample_rate;

    let mut out = Vec::new();
    if spec.sample_format == hound::SampleFormat::Float {
        for sample in reader.samples::<f32>() {
            let s = sample.map_err(|e| AudioError::Io(e.to_string()))?;
            out.push(s);
            if channels == 1 {
                out.push(s); // Mono ke stereo
            }
        }
    } else {
        let max_val = (1i64 << (spec.bits_per_sample - 1)) as f32;
        for sample in reader.samples::<i32>() {
            let s = sample.map_err(|e| AudioError::Io(e.to_string()))?;
            let val = s as f32 / max_val;
            out.push(val);
            if channels == 1 {
                out.push(val);
            }
        }
    }

    Ok((out, sample_rate))
}

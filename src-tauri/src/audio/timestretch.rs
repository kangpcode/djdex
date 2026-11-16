//! Time-stretch (key lock) dengan WSOLA.
//!
//! WSOLA = Waveform Similarity Overlap-Add: grain input di-overlap-add dengan
//! posisi yang dicari agar bentuk gelombang tetap tersambung. Tempo berubah
//! tanpa mengubah pitch. Seluruh state dialokasikan saat `new()`; `process()`
//! tidak melakukan alokasi baru (hanya `Vec` history yang bisa tumbuh, dan
//! hanya di worker thread — bukan callback audio).
//!
//! Trait `TimeStretcher` disediakan supaya implementasi bisa diganti dengan
//! Signalsmith Stretch / SoundTouch (FFI) tanpa menyentuh pipeline deck.
//! Catatan lisensi: SoundTouch LGPL-2.1, Signalsmith Stretch MIT — cek
//! kompatibilitas sebelum memilih library eksternal.

/// Antarmuka time-stretch untuk audio stereo interleaved.
pub trait TimeStretcher {
    /// Proses `input` (stereo interleaved) dengan faktor tempo `speed`
    /// (>1 lebih cepat, <1 lebih lambat) dan tambahkan hasil ke `output`.
    fn process(&mut self, input: &[f32], speed: f32, output: &mut Vec<f32>);
    /// Buang seluruh state (dipakai saat seek/load).
    fn reset(&mut self);
}

/// Panjang grain (frame) dalam sample. 2048 ≈ 43 ms pada 48 kHz.
const FRAME: usize = 2048;
/// Hop output: overlap 50%, sehingga jendela Hann saling menjumlah menjadi 1.
const HOP: usize = FRAME / 2;
/// Rentang pencarian korelasi (frame) di sekitar posisi analisis.
const SEARCH: usize = 128;
/// Panjang potongan yang dikorelasikan (frame).
const CORR: usize = 96;

/// WSOLA dengan buffer history stereo dan akumulator overlap-add.
pub struct WsolaStretcher {
    window: Vec<f32>,
    /// Input stereo interleaved; frame ke-`history_start` adalah `history[0]`.
    history: Vec<f32>,
    history_start: i64,
    /// Posisi analisis absolut yang diharapkan untuk grain berikutnya.
    expected: f64,
    /// Awal grain sebelumnya di ruang input absolut.
    prev_start: Option<i64>,
    /// Akumulator overlap-add sepanjang `FRAME` stereo.
    acc: Vec<f32>,
}

impl WsolaStretcher {
    pub fn new() -> Self {
        let window = (0..FRAME)
            .map(|n| {
                let phase = 2.0 * std::f32::consts::PI * n as f32 / FRAME as f32;
                0.5 - 0.5 * phase.cos()
            })
            .collect();

        Self {
            window,
            history: Vec::with_capacity(FRAME * 2 * 4),
            history_start: 0,
            expected: 0.0,
            prev_start: None,
            acc: vec![0.0; FRAME * 2],
        }
    }

    fn history_end(&self) -> i64 {
        self.history_start + (self.history.len() / 2) as i64
    }

    #[inline]
    fn mono_at(&self, sample_index: usize) -> f32 {
        0.5 * (self.history[sample_index] + self.history[sample_index + 1])
    }

    /// Tambahkan grain windowed dari posisi input absolut `start` ke akumulator.
    fn add_grain(&mut self, start: i64) {
        let base = (start - self.history_start) as usize * 2;
        for n in 0..FRAME {
            let weight = self.window[n];
            let sample = base + n * 2;
            self.acc[n * 2] += weight * self.history[sample];
            self.acc[n * 2 + 1] += weight * self.history[sample + 1];
        }
    }

    /// Keluarkan satu hop dari akumulator, lalu geser sisa overlap ke depan.
    fn emit_hop(&mut self, output: &mut Vec<f32>) {
        output.extend_from_slice(&self.acc[..HOP * 2]);
        self.acc.copy_within(HOP * 2.., 0);
        let len = self.acc.len();
        self.acc[len - HOP * 2..].fill(0.0);
    }

    /// Cari grain yang paling mirip dengan sambungan grain sebelumnya.
    fn best_start(&self, lo: i64, hi: i64) -> i64 {
        let prev = self.prev_start.unwrap_or(lo);
        let template = ((prev + HOP as i64 - self.history_start) as usize) * 2;

        let mut best = lo;
        let mut best_score = f32::NEG_INFINITY;
        for start in lo..=hi {
            let candidate = ((start - self.history_start) as usize) * 2;
            let mut dot = 0.0_f32;
            let mut energy = 0.0_f32;

            for t in 0..CORR {
                let a = self.mono_at(template + t * 2);
                let b = self.mono_at(candidate + t * 2);
                dot += a * b;
                energy += b * b;
            }

            let score = dot / (energy.sqrt() + 1e-9);
            if score > best_score {
                best_score = score;
                best = start;
            }
        }

        best
    }

    /// Buang history lama yang tidak lagi dipakai pencarian berikutnya.
    fn trim(&mut self) {
        let keep = match self.prev_start {
            Some(prev) => {
                (prev + HOP as i64).min(self.expected.round() as i64) - SEARCH as i64 - FRAME as i64
            }
            None => -(FRAME as i64),
        };
        let keep = keep.max(self.history_start);
        if keep <= self.history_start {
            return;
        }

        let drop_frames = (keep - self.history_start) as usize;
        if drop_frames * 2 <= self.history.len() {
            self.history.drain(..drop_frames * 2);
            self.history_start = keep;
        }
    }
}

impl Default for WsolaStretcher {
    fn default() -> Self {
        Self::new()
    }
}

impl TimeStretcher for WsolaStretcher {
    fn process(&mut self, input: &[f32], speed: f32, output: &mut Vec<f32>) {
        // Input selalu stereo interleaved dari worker; abaikan sisa ganjil.
        let usable = input.len() - input.len() % 2;
        if usable > 0 {
            self.history.extend_from_slice(&input[..usable]);
        }

        let speed = f64::from(speed.clamp(0.25, 4.0));

        loop {
            if self.prev_start.is_none() {
                // Grain pertama butuh satu frame penuh; output mulai dengan
                // fade-in wajar dari jendela Hann.
                if self.history_end() < FRAME as i64 {
                    break;
                }
                self.add_grain(0);
                self.prev_start = Some(0);
                self.expected = HOP as f64 * speed;
                self.emit_hop(output);
                continue;
            }

            let expected = self.expected.round() as i64;
            let lo = (expected - SEARCH as i64).max(self.history_start);
            let hi = (expected + SEARCH as i64).min(self.history_end() - FRAME as i64);
            if hi < lo || lo.saturating_add(FRAME as i64) > self.history_end() {
                break;
            }

            let start = self.best_start(lo, hi);
            self.add_grain(start);
            self.prev_start = Some(start);
            self.expected += HOP as f64 * speed;
            self.emit_hop(output);
        }

        self.trim();
    }

    fn reset(&mut self) {
        self.history.clear();
        self.history_start = 0;
        self.expected = 0.0;
        self.prev_start = None;
        self.acc.fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(frames: usize, frequency: f32, rate: f32) -> Vec<f32> {
        let mut data = Vec::with_capacity(frames * 2);
        for i in 0..frames {
            let value = (2.0 * std::f32::consts::PI * frequency * i as f32 / rate).sin() * 0.5;
            data.push(value);
            data.push(value);
        }
        data
    }

    fn stretch(input: &[f32], speed: f32, chunk_frames: usize) -> Vec<f32> {
        let mut stretcher = WsolaStretcher::new();
        let mut output = Vec::new();
        for chunk in input.chunks(chunk_frames * 2) {
            stretcher.process(chunk, speed, &mut output);
        }
        output
    }

    /// Hitung frekuensi dari jumlah zero-crossing pada satu detik output.
    fn measured_hz(output: &[f32], rate: f32) -> f32 {
        let frames = output.len() / 2;
        let start = frames / 2;
        let window = (rate as usize).min(frames - start);
        let slice = &output[start * 2..(start + window) * 2];

        let mut crossings = 0_u32;
        let mut previous = slice[0];
        for frame in slice.as_chunks::<2>().0 {
            let value = frame[0];
            if (previous < 0.0 && value >= 0.0) || (previous >= 0.0 && value < 0.0) {
                crossings += 1;
            }
            previous = value;
        }

        crossings as f32 / 2.0 / (window as f32 / rate)
    }

    #[test]
    fn slower_speed_produces_longer_output_at_same_pitch() {
        let rate = 48_000.0;
        let input = sine(96_000, 440.0, rate);
        let output = stretch(&input, 0.8, 1024);

        let produced = output.len() / 2;
        let expected = 96_000.0 / 0.8;
        assert!(
            (produced as f64 - expected).abs() / expected < 0.06,
            "frame output {produced}, expected {expected}"
        );

        let hz = measured_hz(&output, rate);
        assert!(
            (hz - 440.0).abs() < 25.0,
            "pitch bergeser saat key lock: {hz} Hz"
        );
        assert!(output.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn faster_speed_keeps_pitch_and_shortens_output() {
        let rate = 48_000.0;
        let input = sine(96_000, 440.0, rate);
        let output = stretch(&input, 1.25, 1024);

        let produced = output.len() / 2;
        let expected = 96_000.0 / 1.25;
        assert!(
            (produced as f64 - expected).abs() / expected < 0.06,
            "frame output {produced}, expected {expected}"
        );
        let hz = measured_hz(&output, rate);
        assert!(
            (hz - 440.0).abs() < 25.0,
            "pitch bergeser saat key lock: {hz} Hz"
        );
    }

    #[test]
    fn reset_clears_history_and_priming() {
        let input = sine(24_000, 440.0, 48_000.0);
        let mut stretcher = WsolaStretcher::new();
        let mut output = Vec::new();
        stretcher.process(&input, 1.0, &mut output);
        assert!(!output.is_empty());

        stretcher.reset();
        output.clear();
        stretcher.process(&input, 1.0, &mut output);
        assert!(!output.is_empty());
        let produced = (output.len() / 2) as f64;
        assert!((produced - 24_000.0).abs() < 1_800.0, "{produced}");
    }
}

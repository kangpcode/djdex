//! Generator suara drum, scratch vinyl, dan efek DJ berbasis algoritma DSP sintetis.
//!
//! Menghasilkan buffer audio stereo berkualitas tinggi tanpa perlu aset file eksternal,
//! sehingga 4 bank kit bawaan dapat langsung dimainkan seketika saat aplikasi dibuka.

use std::f32::consts::PI;

/// Helper untuk menghasilkan white noise deterministik sederhana.
struct SimpleRng {
    state: u32,
}

impl SimpleRng {
    fn new(seed: u32) -> Self {
        Self { state: seed }
    }

    fn next_f32(&mut self) -> f32 {
        self.state = self.state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.state as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

/// Menghasilkan Kick Drum sintetis dengan transient punch dan decaying pitch sine.
pub fn synth_kick(sample_rate: u32, duration_secs: f32, start_freq: f32, end_freq: f32, punch: f32) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;
    let mut rng = SimpleRng::new(12345);

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;
        // Pitch drop eksponensial cepat
        let freq = end_freq + (start_freq - end_freq) * (-progress * 18.0).exp();
        phase += 2.0 * PI * freq / sample_rate as f32;
        if phase > 2.0 * PI {
            phase -= 2.0 * PI;
        }

        // Body sine
        let mut sample = phase.sin();

        // Punch click transient di awal (5 ms pertama)
        if t < 0.005 {
            let click_env = 1.0 - (t / 0.005);
            let click = rng.next_f32() * punch * click_env;
            sample = sample * 0.7 + click * 0.3;
        }

        // Envelope amplitudo dengan sustain pendek lalu decay
        let amp_env = (-progress * 6.5).exp();
        let val = (sample * amp_env).clamp(-1.0, 1.0);

        // Interleaved stereo
        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan Snare Drum sintetis (body sine + filtered noise burst).
pub fn synth_snare(sample_rate: u32, duration_secs: f32, body_freq: f32, snappy: f32) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;
    let mut rng = SimpleRng::new(54321);
    let mut noise_lp = 0.0_f32;

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;

        // Body pitch drop
        let freq = body_freq * (-progress * 12.0).exp().max(0.6);
        phase += 2.0 * PI * freq / sample_rate as f32;
        if phase > 2.0 * PI {
            phase -= 2.0 * PI;
        }
        let body = phase.sin() * (-progress * 14.0).exp();

        // Noise snare wires
        let white = rng.next_f32();
        noise_lp += (white - noise_lp) * 0.45; // High/mid filter
        let noise_env = (-progress * 7.5).exp();
        let noise = noise_lp * noise_env * snappy;

        let val = (body * 0.5 + noise * 0.7).clamp(-1.0, 1.0);
        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan Hi-Hat (Closed / Open) sintetis dengan metallic ring.
pub fn synth_hihat(sample_rate: u32, duration_secs: f32, metallic: bool) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut rng = SimpleRng::new(98765);

    // 6 frekuensi osilator metallic khas TR-808/909
    let freqs = [245.0, 306.0, 368.0, 421.0, 538.0, 843.0];
    let mut phases = [0.0_f32; 6];

    for i in 0..frames {
        let progress = i as f32 / frames as f32;
        let mut osc_sum = 0.0_f32;

        if metallic {
            for (idx, freq) in freqs.iter().enumerate() {
                phases[idx] += 2.0 * PI * (*freq * 5.0) / sample_rate as f32;
                if phases[idx] > 2.0 * PI {
                    phases[idx] -= 2.0 * PI;
                }
                // Square wave
                osc_sum += if phases[idx].sin() > 0.0 { 0.15 } else { -0.15 };
            }
        }

        let noise = rng.next_f32() * 0.7;
        let mixed = if metallic { osc_sum * 0.5 + noise * 0.5 } else { noise };
        let env = (-progress * if duration_secs > 0.15 { 6.0 } else { 22.0 }).exp();
        let val = (mixed * env).clamp(-1.0, 1.0);

        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan Hand Clap sintetis (3 transient burst awal lalu diffuse tail).
pub fn synth_clap(sample_rate: u32, duration_secs: f32) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut rng = SimpleRng::new(112233);
    let bursts = [0.000_f32, 0.012, 0.024];

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let mut noise = rng.next_f32();
        // Bandpass perkiraan
        if i % 2 == 0 {
            noise = -noise;
        }

        let mut env = 0.0_f32;
        for &burst_t in &bursts {
            if t >= burst_t {
                let dt = t - burst_t;
                env += (-dt * 150.0).exp() * 0.7;
            }
        }
        // Ekor akhir
        if t > 0.030 {
            env += (-(t - 0.030) * 16.0).exp() * 0.8;
        }

        let val = (noise * env).clamp(-1.0, 1.0);
        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan Tom / Perc sintetis (decaying tone).
pub fn synth_tom(sample_rate: u32, duration_secs: f32, start_freq: f32, end_freq: f32) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;
        let freq = end_freq + (start_freq - end_freq) * (-progress * 10.0).exp();
        phase += 2.0 * PI * freq / sample_rate as f32;
        if phase > 2.0 * PI {
            phase -= 2.0 * PI;
        }

        let body = phase.sin();
        let env = (-progress * 7.0).exp();
        let val = (body * env).clamp(-1.0, 1.0);
        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan efek Turntable Vinyl Scratch sintetis (chirp / baby scratch).
pub fn synth_scratch(sample_rate: u32, duration_secs: f32, style: usize) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;
    let mut rng = SimpleRng::new(778899 + style as u32);

    for i in 0..frames {
        let progress = i as f32 / frames as f32;
        let t = progress * PI;

        // Modulasi kecepatan & pitch piringan maju/mundur
        let speed = match style {
            0 => (t * 2.0).sin().abs() * 1.8 + 0.3, // Baby scratch (maju-mundur)
            1 => progress * 2.5 + 0.2,             // Forward chirp
            2 => ((progress * 16.0 * PI).sin() > 0.0) as i32 as f32 * (progress * 1.5 + 0.5), // Transform scratch
            _ => (t * 3.0).sin().abs() * 2.0 + 0.2,
        };

        // Frekuensi vokal/horn dasar yang di-scratch
        let base_freq = 420.0 * speed;
        phase += 2.0 * PI * base_freq / sample_rate as f32;
        if phase > 2.0 * PI {
            phase -= 2.0 * PI;
        }

        // Bentuk gelombang kaya harmonik + vinyl crackle
        let mut sample = phase.sin() * 0.6 + (phase * 2.0).sin() * 0.3 + (phase * 3.0).sin() * 0.15;
        if rng.next_f32() > 0.985 {
            sample += rng.next_f32() * 0.25; // Vinyl crackle
        }

        let env = (progress * PI).sin(); // Smooth ramp in & out
        let val = (sample * env).clamp(-1.0, 1.0);
        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan efek DJ Siren / Laser sweep sintetis.
pub fn synth_fx(sample_rate: u32, duration_secs: f32, fx_type: usize) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;
    let mut rng = SimpleRng::new(334455 + fx_type as u32);

    for i in 0..frames {
        let progress = i as f32 / frames as f32;
        let t = i as f32 / sample_rate as f32;

        let (sample, env) = match fx_type {
            0 => {
                // Laser zap (2500 Hz turun cepat ke 80 Hz)
                let freq = 80.0 + 2420.0 * (-progress * 12.0).exp();
                phase += 2.0 * PI * freq / sample_rate as f32;
                (phase.sin(), (-progress * 6.0).exp())
            }
            1 => {
                // Dub Siren (osilasi pitch LFO)
                let lfo = (2.0 * PI * 4.0 * t).sin();
                let freq = 650.0 + lfo * 350.0;
                phase += 2.0 * PI * freq / sample_rate as f32;
                (if phase.sin() > 0.0 { 0.7 } else { -0.7 }, (-progress * 3.0).exp())
            }
            2 => {
                // Airhorn blast
                let freq1 = 440.0;
                let freq2 = 554.37; // Major third
                phase += 2.0 * PI * freq1 / sample_rate as f32;
                let phase2 = phase * (freq2 / freq1);
                let tone = (phase.sin() + phase2.sin()) * 0.5;
                (tone, (1.0 - progress * 0.5).clamp(0.0, 1.0))
            }
            _ => {
                // White noise crash / sweep
                let noise = rng.next_f32();
                (noise, (-progress * 4.5).exp())
            }
        };

        let val = (sample * env).clamp(-1.0, 1.0);
        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan Synth Chord Stab sintetis (Minor chord: Root, Minor 3rd, 5th).
pub fn synth_chord_stab(sample_rate: u32, duration_secs: f32, root_freq: f32) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let freqs = [
        root_freq,
        root_freq * 1.1892, // Minor 3rd
        root_freq * 1.4983, // 5th
    ];
    let mut phases = [0.0_f32; 3];

    for i in 0..frames {
        let progress = i as f32 / frames as f32;
        let mut chord = 0.0_f32;

        for (idx, freq) in freqs.iter().enumerate() {
            phases[idx] += 2.0 * PI * freq / sample_rate as f32;
            if phases[idx] > 2.0 * PI {
                phases[idx] -= 2.0 * PI;
            }
            // Sawtooth wave
            let saw = (phases[idx] / PI) - 1.0;
            chord += saw * 0.33;
        }

        let env = (-progress * 7.0).exp();
        let val = (chord * env).clamp(-1.0, 1.0);
        out.push(val);
        out.push(val);
    }
    out
}

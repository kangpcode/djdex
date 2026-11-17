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
pub fn synth_kick(
    sample_rate: u32,
    duration_secs: f32,
    start_freq: f32,
    end_freq: f32,
    punch: f32,
) -> Vec<f32> {
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
        let mixed = if metallic {
            osc_sum * 0.5 + noise * 0.5
        } else {
            noise
        };
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
            1 => progress * 2.5 + 0.2,              // Forward chirp
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
                (
                    if phase.sin() > 0.0 { 0.7 } else { -0.7 },
                    (-progress * 3.0).exp(),
                )
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

/// Menghasilkan suara Kendang Sunda & Jawa sintetis (Tung, Pak, Bem, Dho/Dut).
pub fn synth_kendang(sample_rate: u32, duration_secs: f32, hit_type: usize) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;
    let mut rng = SimpleRng::new(445566 + hit_type as u32);

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;

        let (sample, env) = match hit_type {
            0 => {
                // "Tung" / Ketipung slap tinggi: pitch 220 Hz dengan resonansi kulit
                let freq = 220.0 + 80.0 * (-progress * 15.0).exp();
                phase += 2.0 * PI * freq / sample_rate as f32;
                let tone = phase.sin() * 0.7 + (phase * 2.0).sin() * 0.3;
                let click = if t < 0.006 { rng.next_f32() * 0.4 } else { 0.0 };
                (tone + click, (-progress * 8.5).exp())
            }
            1 => {
                // "Pak" / Tepak kendang Sunda: tepi membran dengan transient cepat & snappy
                let freq = 380.0 * (-progress * 25.0).exp().max(0.4);
                phase += 2.0 * PI * freq / sample_rate as f32;
                let noise = rng.next_f32() * (-progress * 20.0).exp();
                let tone = phase.sin() * 0.4 + noise * 0.8;
                (tone, (-progress * 14.0).exp())
            }
            2 => {
                // "Bem" / Kulanter bass: body rendah kendang 55 Hz
                let freq = 55.0 + 40.0 * (-progress * 10.0).exp();
                phase += 2.0 * PI * freq / sample_rate as f32;
                (phase.sin(), (-progress * 6.0).exp())
            }
            3 => {
                // "Dho / Dut" Koplo / Tabla bass: pitch drop khas 110 Hz -> 42 Hz
                let freq = 42.0 + 75.0 * (-progress * 8.0).exp();
                phase += 2.0 * PI * freq / sample_rate as f32;
                let tone = phase.sin() * 0.85 + (phase * 2.0).sin() * 0.15;
                (tone, (-progress * 5.5).exp())
            }
            4 => {
                // "Tong" / Kulanter tinggi: resonansi 280 Hz ring
                let freq = 280.0 + 90.0 * (-progress * 12.0).exp();
                phase += 2.0 * PI * freq / sample_rate as f32;
                let tone = phase.sin() * 0.6 + (phase * 2.0).sin() * 0.35 + (phase * 3.0).sin() * 0.1;
                (tone, (-progress * 7.5).exp())
            }
            5 => {
                // "Plak" / Open slap membran kendang Jaipong 460 Hz
                let freq = 460.0 * (-progress * 22.0).exp().max(0.3);
                phase += 2.0 * PI * freq / sample_rate as f32;
                let noise = rng.next_f32() * (-progress * 18.0).exp();
                let tone = phase.sin() * 0.3 + noise * 0.9;
                (tone, (-progress * 16.0).exp())
            }
            6 => {
                // "Ketuk" / Kayu bingkai kendang (Wood Rim Knock) 1200 Hz
                let freq = 1200.0 * (-progress * 30.0).exp().max(0.2);
                phase += 2.0 * PI * freq / sample_rate as f32;
                let tone = phase.sin() * 0.5 + rng.next_f32() * 0.5;
                (tone, (-progress * 24.0).exp())
            }
            7 => {
                // "Dhot Koplo Deep Sub" (pitch drop 90 Hz -> 34 Hz sub rumble)
                let freq = 34.0 + 60.0 * (-progress * 6.0).exp();
                phase += 2.0 * PI * freq / sample_rate as f32;
                let tone = phase.sin() * 0.9 + (phase * 2.0).sin() * 0.1;
                (tone, (-progress * 4.5).exp())
            }
            8 => {
                // "Kendang Indung" (Warm deep body boom 46 Hz)
                let freq = 46.0 + 25.0 * (-progress * 8.0).exp();
                phase += 2.0 * PI * freq / sample_rate as f32;
                (phase.sin(), (-progress * 5.0).exp())
            }
            9 => {
                // "Muted Tepak" (Slap redam / muted rim)
                let freq = 260.0;
                phase += 2.0 * PI * freq / sample_rate as f32;
                let click = rng.next_f32() * 0.7;
                (phase.sin() * 0.3 + click, (-progress * 22.0).exp())
            }
            10 => {
                // "Tung Mid" (175 Hz resonansi nada sedang)
                let freq = 175.0 + 50.0 * (-progress * 14.0).exp();
                phase += 2.0 * PI * freq / sample_rate as f32;
                let tone = phase.sin() * 0.75 + (phase * 2.0).sin() * 0.25;
                (tone, (-progress * 8.0).exp())
            }
            _ => {
                // "Rampak Double Roll" (Pukulan rampak beruntun)
                let sub_hit = ((progress * 32.0 * PI).sin() > 0.0) as i32 as f32;
                let freq = 200.0 + 80.0 * sub_hit;
                phase += 2.0 * PI * freq / sample_rate as f32;
                let tone = phase.sin() * 0.6 + rng.next_f32() * 0.4;
                (tone, (-progress * 7.0).exp())
            }
        };

        let val = (sample * env).clamp(-1.0, 1.0);
        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan instrumen Gamelan Jawa & Sunda sintetis (Gong Ageng, Saron, Bonang, Kempul).
pub fn synth_gamelan(sample_rate: u32, duration_secs: f32, freq: f32, is_gong: bool) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);

    // Rasio overtone perunggu inharmonik khas gamelan: 1.0, 2.76, 5.40, 8.93
    let ratios = [1.0_f32, 2.76, 5.40, 8.93];
    let mut phases = [0.0_f32; 4];
    let mut rng = SimpleRng::new(889911);

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;

        let mut sum = 0.0_f32;
        for (idx, &ratio) in ratios.iter().enumerate() {
            let part_freq = freq * ratio;
            phases[idx] += 2.0 * PI * part_freq / sample_rate as f32;
            if phases[idx] > 2.0 * PI {
                phases[idx] -= 2.0 * PI;
            }
            let amp = match idx {
                0 => 0.65,
                1 => 0.35,
                2 => 0.15,
                _ => 0.08,
            };
            sum += phases[idx].sin() * amp;
        }

        // Ketukan palu kayu / bronze mallet di awal
        if t < 0.008 {
            let click = rng.next_f32() * 0.3 * (1.0 - t / 0.008);
            sum += click;
        }

        // Shimmer getaran ombak gamelan (beating shimmer ~2.5 Hz untuk Gong Ageng)
        let shimmer = if is_gong {
            1.0 + 0.25 * (2.0 * PI * 2.5 * t).sin()
        } else {
            1.0
        };

        let decay_rate = if is_gong { 2.5 } else { 5.5 };
        let env = (-progress * decay_rate).exp() * shimmer;
        let val = (sum * env).clamp(-1.0, 1.0);

        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan suara Angklung bambu Sunda sintetis.
pub fn synth_angklung(sample_rate: u32, duration_secs: f32, root_freq: f32) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase1 = 0.0_f32;
    let mut phase2 = 0.0_f32;
    let mut rng = SimpleRng::new(123789);

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;

        // Dua tabung bambu berjarak 1 oktaf
        phase1 += 2.0 * PI * root_freq / sample_rate as f32;
        phase2 += 2.0 * PI * (root_freq * 2.0) / sample_rate as f32;
        if phase1 > 2.0 * PI { phase1 -= 2.0 * PI; }
        if phase2 > 2.0 * PI { phase2 -= 2.0 * PI; }

        let bamboo = phase1.sin() * 0.65 + phase2.sin() * 0.35;

        // Rattle getaran bingkai bambu (bamboo clack)
        let rattle = if t < 0.035 {
            rng.next_f32() * 0.25 * (1.0 - t / 0.035)
        } else {
            0.0
        };

        let env = (-progress * 6.0).exp();
        let val = ((bamboo + rattle) * env).clamp(-1.0, 1.0);

        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan suara Suling Sunda / Shakuhachi bambu sintetis.
pub fn synth_suling(sample_rate: u32, duration_secs: f32, freq: f32) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;
    let mut rng = SimpleRng::new(654321);

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;

        // Vibrato lembut khas suling ~5 Hz
        let vib = (2.0 * PI * 5.0 * t).sin() * 4.0;
        phase += 2.0 * PI * (freq + vib) / sample_rate as f32;
        if phase > 2.0 * PI { phase -= 2.0 * PI; }

        let tone = phase.sin() * 0.75 + (phase * 2.0).sin() * 0.18 + (phase * 3.0).sin() * 0.07;
        // Hembusan desis nafas udara bambu
        let breath = rng.next_f32() * 0.12;

        let attack = (t / 0.06).min(1.0);
        let decay = (-progress * 3.5).exp();
        let val = ((tone + breath) * attack * decay).clamp(-1.0, 1.0);

        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan suara drum Taiko Jepang sintetis (O-Daiko punchy).
pub fn synth_taiko(sample_rate: u32, duration_secs: f32, punch: f32) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;
    let mut rng = SimpleRng::new(991122);

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;

        // Pitch drop dari 95 Hz turun ke 36 Hz (body kayu besar O-Daiko)
        let freq = 36.0 + 59.0 * (-progress * 12.0).exp();
        phase += 2.0 * PI * freq / sample_rate as f32;
        if phase > 2.0 * PI { phase -= 2.0 * PI; }

        let mut body = phase.sin();

        // Bachi stick slap transient di awal (10ms)
        if t < 0.010 {
            let stick = rng.next_f32() * punch * (1.0 - t / 0.010);
            body = body * 0.65 + stick * 0.45;
        }

        let env = (-progress * 4.2).exp();
        let val = (body * env).clamp(-1.0, 1.0);

        out.push(val);
        out.push(val);
    }
    out
}

/// Menghasilkan petikan Koto & Shamisen Jepang sintetis.
pub fn synth_koto_shamisen(sample_rate: u32, duration_secs: f32, freq: f32, is_shamisen: bool) -> Vec<f32> {
    let frames = (sample_rate as f32 * duration_secs) as usize;
    let mut out = Vec::with_capacity(frames * 2);
    let mut phase = 0.0_f32;
    let mut rng = SimpleRng::new(332211);

    for i in 0..frames {
        let t = i as f32 / sample_rate as f32;
        let progress = t / duration_secs;

        phase += 2.0 * PI * freq / sample_rate as f32;
        if phase > 2.0 * PI { phase -= 2.0 * PI; }

        // Shamisen lebih bright sawtooth (bachi plucking), Koto lebih mellow triangle/sine
        let string_tone = if is_shamisen {
            (phase / PI) - 1.0 // Sawtooth
        } else {
            phase.sin() * 0.7 + (phase * 2.0).sin() * 0.3
        };

        // Plectrum snap
        let snap = if t < 0.005 {
            rng.next_f32() * 0.35 * (1.0 - t / 0.005)
        } else {
            0.0
        };

        let decay_rate = if is_shamisen { 8.0 } else { 5.0 };
        let env = (-progress * decay_rate).exp();
        let val = ((string_tone + snap) * env).clamp(-1.0, 1.0);

        out.push(val);
        out.push(val);
    }
    out
}

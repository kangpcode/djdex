//! Unit test untuk Sampler, Synth, Sequencer, dan Bank.

use super::bank::*;
use super::player::*;
use super::sequencer::*;
use super::synth::*;

#[test]
fn test_synth_generates_valid_stereo_audio() {
    let kick = synth_kick(44100, 0.2, 160.0, 50.0, 0.5);
    assert!(!kick.is_empty());
    assert_eq!(kick.len() % 2, 0); // Stereo
    for &s in &kick {
        assert!((-1.05..=1.05).contains(&s));
    }

    let snare = synth_snare(44100, 0.2, 200.0, 0.8);
    assert!(!snare.is_empty());

    let hihat = synth_hihat(44100, 0.05, true);
    assert!(!hihat.is_empty());

    let scratch = synth_scratch(44100, 0.25, 0);
    assert!(!scratch.is_empty());
}

#[test]
fn test_default_banks_initialization() {
    let banks = create_default_banks(44100);
    assert_eq!(banks.len(), 12);
    for bank in &banks {
        assert_eq!(bank.pads.len(), 16);
        for pad in &bank.pads {
            assert!(
                pad.is_loaded(),
                "Pad {} di bank {} harus terisi audio",
                pad.id,
                bank.name
            );
            assert!(pad.duration_secs > 0.0);
        }
    }
}

#[test]
fn test_sequencer_step_frames_and_swing() {
    let mut seq = StepSequencer::new(120.0);
    let sample_rate = 44100.0;
    // 1 beat = 0.5s -> 1 step (1/16) = 0.125s -> 0.125 * 44100 = 5512.5 frames
    let base = seq.base_step_frames(sample_rate, 120.0);
    assert!((base - 5512.5).abs() < 1.0);

    seq.swing = 0.5;
    seq.current_step = 0; // Genap -> diperpanjang
    let target_even = seq.current_step_target_frames(sample_rate, 120.0);
    assert!(target_even > base);

    seq.current_step = 1; // Ganjil -> diperpendek
    let target_odd = seq.current_step_target_frames(sample_rate, 120.0);
    assert!(target_odd < base);

    // Rata-rata 2 step harus sama dengan 2 * base
    assert!(((target_even + target_odd) - 2.0 * base).abs() < 1e-4);
}

#[test]
fn test_sequencer_trigger_execution() {
    let mut seq = StepSequencer::new(120.0);
    seq.set_running(true);
    let mut triggers = [(0, 100); TRACK_COUNT];
    let mut count = 0;

    // Pattern default memiliki Kick di step 0 (tapi playhead mulai dari 0 dan tick ke 1 saat threshold lewat)
    seq.tick_frame(44100.0, 120.0, &mut triggers, &mut count);
    assert_eq!(count, 0); // Belum mencapai batas step pertama
}

#[test]
fn test_sampler_process_renders_audio_on_trigger() {
    let (controller, mut rt) = SamplerController::new(44100);
    controller.trigger_pad(0, Some(1.0));

    let frames = 512;
    rt.process_block(frames, 128.0);

    // Audio harus terisi sinyal Kick
    let energy_l: f32 = (0..frames).map(|i| rt.sample_at(i).0.abs()).sum();
    let energy_r: f32 = (0..frames).map(|i| rt.sample_at(i).1.abs()).sum();
    assert!(
        energy_l > 0.0,
        "Output kiri harus menghasilkan audio setelah pad dipicu"
    );
    assert!(
        energy_r > 0.0,
        "Output kanan harus menghasilkan audio setelah pad dipicu"
    );
}

#[test]
fn test_sample_pack_export_and_import() {
    let banks = create_default_banks(44100);
    let bank = &banks[0];
    let temp_dir = std::env::temp_dir();
    let pack_path = temp_dir.join("test_djdex_pack.zip");

    // Export
    export_sample_pack(bank, &pack_path).expect("Export harus berhasil");
    assert!(pack_path.exists());

    // Import ke bank baru kosong
    let mut new_bank = SampleBank::new(0, "Imported Bank");
    import_sample_pack(&pack_path, &mut new_bank).expect("Import harus berhasil");

    assert_eq!(new_bank.name, bank.name);
    for i in 0..16 {
        assert_eq!(new_bank.pads[i].name, bank.pads[i].name);
        assert!(new_bank.pads[i].is_loaded());
    }

    let _ = std::fs::remove_file(pack_path);
}

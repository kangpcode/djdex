//! Dispatcher aksi DJ: mengeksekusi `DjAction` ke `AppState` dan mengirim LED feedback ke hardware.

use parking_lot::Mutex;

use crate::audio::fx::FxSlotUpdate;
use crate::audio::mixer::MixerUpdate;
use crate::state::AppState;

use super::device::MidiDeviceManager;
use super::types::{DjAction, MidiMapping, MidiMessageType};

pub struct MidiDispatcher;

impl MidiDispatcher {
    /// Eksekusi satu aksi DJ dengan nilai parameter (0..127).
    pub fn dispatch(
        action: &DjAction,
        value: u8,
        state: &AppState,
        device: Option<&Mutex<MidiDeviceManager>>,
    ) -> Result<(), String> {
        let is_press = value > 0;

        match action {
            // ---- Deck Controls ----
            DjAction::DeckPlay { deck } => {
                if is_press {
                    let current = state
                        .deck_status(*deck)
                        .map(|s| s.playing)
                        .unwrap_or(false);
                    if current {
                        let _ = state.deck_pause(*deck);
                    } else {
                        let _ = state.deck_play(*deck);
                    }
                }
            }

            DjAction::DeckCue { deck } => {
                if is_press {
                    let _ = state.deck_cue_jump(*deck);
                }
            }

            DjAction::DeckSync { deck } => {
                if is_press {
                    let other_deck = if *deck == 0 { 1 } else { 0 };
                    let _ = state.sync_deck(other_deck, *deck);
                }
            }

            DjAction::DeckPitch { deck } => {
                // Konversi 0..127 (center 64) ke speed multiplier (-8% .. +8%)
                let delta = (value as f32 - 64.0) / 64.0;
                let speed = 1.0 + delta * 0.08;
                let _ = state.deck_set_speed(*deck, speed);
            }

            DjAction::DeckPitchBend { deck, direction } => {
                if is_press {
                    let bend = *direction as f32 * 0.05;
                    let _ = state.deck_set_bend(*deck, bend);
                } else {
                    let _ = state.deck_set_bend(*deck, 0.0);
                }
            }

            DjAction::DeckJog { deck, mode } => {
                let delta = mode.decode_delta(value);
                // Nudge deck position atau pitch bend sesaat
                if delta.abs() > 0.001 {
                    let current_status = state.deck_status(*deck);
                    if let Ok(st) = current_status {
                        let new_pos = (st.position_secs + (delta as f64) * 0.05).max(0.0);
                        let _ = state.deck_seek(*deck, new_pos);
                    }
                }
            }

            DjAction::DeckHotCue { deck, index } => {
                if is_press {
                    let _ = state.deck_trigger_hot_cue(*deck, *index as u8);
                }
            }

            DjAction::DeckLoopToggle { deck } => {
                if is_press {
                    let status = state.deck_status(*deck);
                    if let Ok(st) = status {
                        if st.loop_active {
                            let _ = state.deck_exit_loop(*deck);
                        } else {
                            let _ = state.deck_set_loop(*deck, 4.0);
                        }
                    }
                }
            }

            DjAction::DeckLoopHalf { deck } => {
                if is_press {
                    let status = state.deck_status(*deck);
                    if let Ok(st) = status {
                        let current_beats = st.loop_length_beats.unwrap_or(4.0);
                        let new_beats = (current_beats * 0.5).max(0.25);
                        let _ = state.deck_set_loop(*deck, new_beats);
                    }
                }
            }

            DjAction::DeckLoopDouble { deck } => {
                if is_press {
                    let status = state.deck_status(*deck);
                    if let Ok(st) = status {
                        let current_beats = st.loop_length_beats.unwrap_or(4.0);
                        let new_beats = (current_beats * 2.0).min(64.0);
                        let _ = state.deck_set_loop(*deck, new_beats);
                    }
                }
            }

            DjAction::DeckBeatJump { deck, beats } => {
                if is_press {
                    let status = state.deck_status(*deck);
                    if let Ok(st) = status {
                        let beat_secs = 60.0 / st.bpm.max(20.0);
                        let jump_secs = beats * beat_secs;
                        let _ = state.deck_beat_jump(*deck, jump_secs);
                    }
                }
            }

            // ---- Mixer Controls ----
            DjAction::MixerFader { deck } => {
                let vol = (value as f32) / 127.0;
                let fader = if *deck == 0 {
                    [Some(vol), None]
                } else {
                    [None, Some(vol)]
                };
                let _ = state.set_mixer(MixerUpdate {
                    fader: Some(fader),
                    ..Default::default()
                });
            }

            DjAction::MixerCrossfader => {
                let xf = ((value as f32) - 64.0) / 64.0;
                let _ = state.set_mixer(MixerUpdate {
                    crossfader: Some(xf.clamp(-1.0, 1.0)),
                    ..Default::default()
                });
            }

            DjAction::MixerEqLow { deck } => {
                let gain = (value as f32) / 64.0; // 0..2.0
                let eq = if *deck == 0 {
                    [Some([Some(gain), None, None]), None]
                } else {
                    [None, Some([Some(gain), None, None])]
                };
                let _ = state.set_mixer(MixerUpdate {
                    eq_gain: Some(eq),
                    ..Default::default()
                });
            }

            DjAction::MixerEqMid { deck } => {
                let gain = (value as f32) / 64.0;
                let eq = if *deck == 0 {
                    [Some([None, Some(gain), None]), None]
                } else {
                    [None, Some([None, Some(gain), None])]
                };
                let _ = state.set_mixer(MixerUpdate {
                    eq_gain: Some(eq),
                    ..Default::default()
                });
            }

            DjAction::MixerEqHigh { deck } => {
                let gain = (value as f32) / 64.0;
                let eq = if *deck == 0 {
                    [Some([None, None, Some(gain)]), None]
                } else {
                    [None, Some([None, None, Some(gain)])]
                };
                let _ = state.set_mixer(MixerUpdate {
                    eq_gain: Some(eq),
                    ..Default::default()
                });
            }

            DjAction::MixerFilter { deck } => {
                let filter = ((value as f32) - 64.0) / 64.0; // -1.0..1.0
                let filt = if *deck == 0 {
                    [Some(filter.clamp(-1.0, 1.0)), None]
                } else {
                    [None, Some(filter.clamp(-1.0, 1.0))]
                };
                let _ = state.set_mixer(MixerUpdate {
                    filter: Some(filt),
                    ..Default::default()
                });
            }

            DjAction::MixerGain { deck } => {
                let gain_db = ((value as f32) - 64.0) / 64.0 * 12.0; // -12dB..+12dB
                let _ = state.deck_set_gain(*deck, gain_db);
            }

            DjAction::MixerPfl { deck } => {
                if is_press {
                    let current = state.mixer_status();
                    let pfl_idx = *deck;
                    let current_pfl = current.headphone.pfl.get(pfl_idx).copied().unwrap_or(false);
                    let mut new_pfl = current.headphone.pfl;
                    if pfl_idx < new_pfl.len() {
                        new_pfl[pfl_idx] = !current_pfl;
                    }
                    let _ = state.set_mixer(MixerUpdate {
                        headphone_pfl: Some(new_pfl),
                        ..Default::default()
                    });
                }
            }

            DjAction::MixerMasterVolume => {
                let vol = (value as f32) / 127.0;
                let _ = state.set_mixer(MixerUpdate {
                    master_volume: Some(vol),
                    ..Default::default()
                });
            }

            DjAction::MixerCueVolume => {
                let vol = (value as f32) / 127.0;
                let _ = state.set_mixer(MixerUpdate {
                    headphone_volume: Some(vol),
                    ..Default::default()
                });
            }

            DjAction::MixerCueMix => {
                let mix = (value as f32) / 127.0;
                let _ = state.set_mixer(MixerUpdate {
                    headphone_mix: Some(mix),
                    ..Default::default()
                });
            }

            // ---- Sampler & Remixer Controls ----
            DjAction::SamplerPad { pad } => {
                if is_press {
                    let vel = (value as f32) / 127.0;
                    let _ = state.trigger_sampler_pad(*pad, Some(vel));
                } else {
                    let _ = state.release_sampler_pad(*pad);
                }
            }

            DjAction::SamplerBankSelect { bank } => {
                if is_press {
                    let _ = state.select_sampler_bank(*bank);
                }
            }

            DjAction::SamplerVolume => {
                let vol = (value as f32) / 127.0;
                let _ = state.set_sampler_volume(vol);
            }

            // ---- FX Controls ----
            DjAction::FxToggle { chain, slot } => {
                if is_press {
                    let fx_st = state.fx_status();
                    let enabled = fx_st
                        .chains
                        .get(*chain)
                        .and_then(|c| c.slots.get(*slot))
                        .map(|s| s.enabled)
                        .unwrap_or(false);

                    let _ = state.set_fx(FxSlotUpdate {
                        chain: *chain,
                        slot: *slot,
                        enabled: Some(!enabled),
                        wet_dry: None,
                        kind: None,
                        param_1: None,
                        param_2: None,
                        param_3: None,
                        bpm: None,
                    });
                }
            }

            DjAction::FxWetDry { chain, slot } => {
                let wet_dry = (value as f32) / 127.0;
                let _ = state.set_fx(FxSlotUpdate {
                    chain: *chain,
                    slot: *slot,
                    enabled: None,
                    wet_dry: Some(wet_dry),
                    kind: None,
                    param_1: None,
                    param_2: None,
                    param_3: None,
                    bpm: None,
                });
            }

            // ---- Browser & Library Controls ----
            DjAction::BrowserScroll { .. } => {
                // Direspon di UI atau via event
            }

            DjAction::BrowserLoadDeck { .. } => {
                // Direspon di UI atau via event
            }
        }

        // Jalankan pembaruan LED feedback jika port output terhubung
        if let Some(dev_mutex) = device {
            let mut dev = dev_mutex.lock();
            if dev.connected_output().is_some() {
                Self::send_action_feedback(action, state, &mut dev);
            }
        }

        Ok(())
    }

    /// Mengirim sinyal LED feedback kembali ke controller fisik sesuai status terkini di `AppState`.
    fn send_action_feedback(action: &DjAction, state: &AppState, dev: &mut MidiDeviceManager) {
        match action {
            DjAction::DeckPlay { deck } => {
                if let Ok(st) = state.deck_status(*deck) {
                    let ch = *deck as u8;
                    // DDJ Play note: 11
                    let _ = dev.send_led(ch, 11, false, st.playing);
                }
            }
            DjAction::DeckCue { deck } => {
                if let Ok(st) = state.deck_status(*deck) {
                    let ch = *deck as u8;
                    // DDJ Cue note: 12
                    let _ = dev.send_led(ch, 12, false, st.cue_position_secs.is_some());
                }
            }
            DjAction::DeckSync { deck } => {
                let ch = *deck as u8;
                // DDJ Sync note: 88
                let _ = dev.send_led(ch, 88, false, true);
            }
            DjAction::DeckLoopToggle { deck } => {
                if let Ok(st) = state.deck_status(*deck) {
                    let ch = *deck as u8;
                    // DDJ Loop note: 16
                    let _ = dev.send_led(ch, 16, false, st.loop_active);
                }
            }
            DjAction::MixerPfl { deck } => {
                let ch = *deck as u8;
                let mx = state.mixer_status();
                let pfl = mx.headphone.pfl.get(*deck).copied().unwrap_or(false);
                // DDJ Headphone Cue note: 84
                let _ = dev.send_led(ch, 84, false, pfl);
            }
            _ => {}
        }
    }

    /// Sinkronisasi penuh semua status LED controller saat terhubung pertama kali.
    pub fn sync_all_leds(
        state: &AppState,
        dev: &mut MidiDeviceManager,
        mappings: &[MidiMapping],
    ) {
        if dev.connected_output().is_none() {
            return;
        }

        for m in mappings {
            let is_cc = m.message_type == MidiMessageType::ControlChange;
            match &m.action {
                DjAction::DeckPlay { deck } => {
                    if let Ok(st) = state.deck_status(*deck) {
                        let _ = dev.send_led(m.channel, m.control, is_cc, st.playing);
                    }
                }
                DjAction::DeckCue { deck } => {
                    if let Ok(st) = state.deck_status(*deck) {
                        let _ = dev.send_led(
                            m.channel,
                            m.control,
                            is_cc,
                            st.cue_position_secs.is_some(),
                        );
                    }
                }
                DjAction::DeckLoopToggle { deck } => {
                    if let Ok(st) = state.deck_status(*deck) {
                        let _ = dev.send_led(m.channel, m.control, is_cc, st.loop_active);
                    }
                }
                DjAction::MixerPfl { deck } => {
                    let mx = state.mixer_status();
                    let pfl = mx.headphone.pfl.get(*deck).copied().unwrap_or(false);
                    let _ = dev.send_led(m.channel, m.control, is_cc, pfl);
                }
                DjAction::DeckHotCue { deck, index } => {
                    if let Ok(st) = state.deck_status(*deck) {
                        let has_cue = st
                            .hot_cues
                            .get(*index)
                            .and_then(|c| c.as_ref())
                            .is_some();
                        let _ = dev.send_led(m.channel, m.control, is_cc, has_cue);
                    }
                }
                _ => {}
            }
        }
    }
}

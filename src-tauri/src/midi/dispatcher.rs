//! Dispatcher aksi DJ: mengeksekusi `DjAction` ke `AudioEngine` dan mengirim LED feedback ke hardware.

use crate::audio::engine::AudioEngine;
use crate::audio::fx::FxSlotUpdate;
use crate::audio::mixer::{ChannelUpdate, MixerUpdate};

use super::device::MidiDeviceManager;
use super::types::{DjAction, MidiMapping, MidiMessageType};

pub struct MidiDispatcher;

impl MidiDispatcher {
    /// Eksekusi satu aksi DJ dengan nilai parameter (0..127).
    pub fn dispatch(
        action: &DjAction,
        value: u8,
        engine: &AudioEngine,
        dev: &mut MidiDeviceManager,
    ) {
        let is_press = value > 0;

        match action {
            // ---- Deck Controls ----
            DjAction::DeckPlay { deck } => {
                if is_press {
                    if let Ok(d) = engine.deck(*deck) {
                        if d.status().playing {
                            d.pause();
                        } else {
                            d.play();
                        }
                    }
                }
            }

            DjAction::DeckCue { deck } => {
                if is_press {
                    if let Ok(d) = engine.deck(*deck) {
                        d.cue_jump();
                    }
                }
            }

            DjAction::DeckSync { deck } => {
                if is_press {
                    let other = if *deck == 0 { 1 } else { 0 };
                    let _ = engine.sync_deck(other, *deck);
                }
            }

            DjAction::DeckPitch { deck } => {
                if let Ok(d) = engine.deck(*deck) {
                    let delta = (value as f32 - 64.0) / 64.0;
                    let speed = 1.0 + delta * 0.08;
                    d.set_speed(speed);
                }
            }

            DjAction::DeckPitchBend { deck, direction } => {
                if let Ok(d) = engine.deck(*deck) {
                    if is_press {
                        d.set_bend(*direction as f32 * 0.05);
                    } else {
                        d.set_bend(0.0);
                    }
                }
            }

            DjAction::DeckJog { deck, mode } => {
                if let Ok(d) = engine.deck(*deck) {
                    let delta = mode.decode_delta(value);
                    if delta.abs() > 0.001 {
                        let st = d.status();
                        let new_pos = (st.position_secs + (delta as f64) * 0.05).max(0.0);
                        d.seek(new_pos);
                    }
                }
            }

            DjAction::DeckHotCue { deck, index } => {
                if is_press {
                    if let Ok(d) = engine.deck(*deck) {
                        d.hot_cue_trigger(*index as u8);
                    }
                }
            }

            DjAction::DeckLoopToggle { deck } => {
                if is_press {
                    if let Ok(d) = engine.deck(*deck) {
                        let st = d.status();
                        if st.loop_active {
                            d.exit_loop();
                        } else {
                            let start = st.position_secs;
                            let beat_secs = 60.0 / st.bpm.max(20.0);
                            let end = start + 4.0 * beat_secs;
                            d.set_loop(start, end, 4.0);
                        }
                    }
                }
            }

            DjAction::DeckLoopHalf { deck } => {
                if is_press {
                    if let Ok(d) = engine.deck(*deck) {
                        let st = d.status();
                        let current_beats = if st.loop_beats > 0.0 {
                            st.loop_beats
                        } else {
                            4.0
                        };
                        let new_beats = (current_beats * 0.5).max(0.25);
                        let start = if st.loop_active {
                            st.loop_start_secs
                        } else {
                            st.position_secs
                        };
                        let beat_secs = 60.0 / st.bpm.max(20.0);
                        let end = start + new_beats * beat_secs;
                        d.set_loop(start, end, new_beats);
                    }
                }
            }

            DjAction::DeckLoopDouble { deck } => {
                if is_press {
                    if let Ok(d) = engine.deck(*deck) {
                        let st = d.status();
                        let current_beats = if st.loop_beats > 0.0 {
                            st.loop_beats
                        } else {
                            4.0
                        };
                        let new_beats = (current_beats * 2.0).min(64.0);
                        let start = if st.loop_active {
                            st.loop_start_secs
                        } else {
                            st.position_secs
                        };
                        let beat_secs = 60.0 / st.bpm.max(20.0);
                        let end = start + new_beats * beat_secs;
                        d.set_loop(start, end, new_beats);
                    }
                }
            }

            DjAction::DeckBeatJump { deck, beats } => {
                if is_press {
                    if let Ok(d) = engine.deck(*deck) {
                        let st = d.status();
                        let beat_secs = 60.0 / st.bpm.max(20.0);
                        d.beat_jump(beats * beat_secs);
                    }
                }
            }

            // ---- Mixer Controls ----
            DjAction::MixerFader { deck } => {
                let vol = (value as f32) / 127.0;
                let ch_upd = ChannelUpdate {
                    fader: Some(vol),
                    ..Default::default()
                };
                let update = if *deck == 0 {
                    MixerUpdate {
                        channel_a: Some(ch_upd),
                        ..Default::default()
                    }
                } else {
                    MixerUpdate {
                        channel_b: Some(ch_upd),
                        ..Default::default()
                    }
                };
                engine.apply_mixer(update);
            }

            DjAction::MixerCrossfader => {
                let xf = (value as f32) / 127.0; // 0.0 .. 1.0 (center 0.5)
                engine.apply_mixer(MixerUpdate {
                    crossfader: Some(xf),
                    ..Default::default()
                });
            }

            DjAction::MixerEqLow { deck } => {
                let db = ((value as f32) / 127.0 - 0.5) * 48.0; // -24dB .. +24dB
                let ch_upd = ChannelUpdate {
                    low_db: Some(db),
                    ..Default::default()
                };
                let update = if *deck == 0 {
                    MixerUpdate {
                        channel_a: Some(ch_upd),
                        ..Default::default()
                    }
                } else {
                    MixerUpdate {
                        channel_b: Some(ch_upd),
                        ..Default::default()
                    }
                };
                engine.apply_mixer(update);
            }

            DjAction::MixerEqMid { deck } => {
                let db = ((value as f32) / 127.0 - 0.5) * 48.0;
                let ch_upd = ChannelUpdate {
                    mid_db: Some(db),
                    ..Default::default()
                };
                let update = if *deck == 0 {
                    MixerUpdate {
                        channel_a: Some(ch_upd),
                        ..Default::default()
                    }
                } else {
                    MixerUpdate {
                        channel_b: Some(ch_upd),
                        ..Default::default()
                    }
                };
                engine.apply_mixer(update);
            }

            DjAction::MixerEqHigh { deck } => {
                let db = ((value as f32) / 127.0 - 0.5) * 48.0;
                let ch_upd = ChannelUpdate {
                    high_db: Some(db),
                    ..Default::default()
                };
                let update = if *deck == 0 {
                    MixerUpdate {
                        channel_a: Some(ch_upd),
                        ..Default::default()
                    }
                } else {
                    MixerUpdate {
                        channel_b: Some(ch_upd),
                        ..Default::default()
                    }
                };
                engine.apply_mixer(update);
            }

            DjAction::MixerFilter { deck } => {
                let filter = ((value as f32) - 64.0) / 64.0; // -1.0 .. 1.0
                let ch_upd = ChannelUpdate {
                    filter: Some(filter.clamp(-1.0, 1.0)),
                    ..Default::default()
                };
                let update = if *deck == 0 {
                    MixerUpdate {
                        channel_a: Some(ch_upd),
                        ..Default::default()
                    }
                } else {
                    MixerUpdate {
                        channel_b: Some(ch_upd),
                        ..Default::default()
                    }
                };
                engine.apply_mixer(update);
            }

            DjAction::MixerGain { deck } => {
                if let Ok(d) = engine.deck(*deck) {
                    let gain_db = ((value as f32) - 64.0) / 64.0 * 12.0;
                    d.set_gain_db(gain_db);
                }
            }

            DjAction::MixerPfl { deck } => {
                if is_press {
                    let current = engine.mixer_status();
                    let pfl_idx = *deck;
                    if pfl_idx < current.channels.len() {
                        let cur_pfl = current.channels[pfl_idx].pfl;
                        let ch_upd = ChannelUpdate {
                            pfl: Some(!cur_pfl),
                            ..Default::default()
                        };
                        let update = if *deck == 0 {
                            MixerUpdate {
                                channel_a: Some(ch_upd),
                                ..Default::default()
                            }
                        } else {
                            MixerUpdate {
                                channel_b: Some(ch_upd),
                                ..Default::default()
                            }
                        };
                        engine.apply_mixer(update);
                    }
                }
            }

            DjAction::MixerMasterVolume => {
                let vol = (value as f32) / 127.0;
                engine.apply_mixer(MixerUpdate {
                    master_volume: Some(vol),
                    ..Default::default()
                });
            }

            DjAction::MixerCueVolume => {
                let vol = (value as f32) / 127.0;
                engine.apply_mixer(MixerUpdate {
                    cue_volume: Some(vol),
                    ..Default::default()
                });
            }

            DjAction::MixerCueMix => {
                let mix = (value as f32) / 127.0;
                engine.apply_mixer(MixerUpdate {
                    cue_mix: Some(mix),
                    ..Default::default()
                });
            }

            // ---- Sampler & Remixer Controls ----
            DjAction::SamplerPad { pad } => {
                if is_press {
                    let vel = (value as f32) / 127.0;
                    engine.sampler().trigger_pad(*pad, Some(vel));
                } else {
                    engine.sampler().release_pad(*pad);
                }
            }

            DjAction::SamplerBankSelect { bank } => {
                if is_press {
                    engine.sampler().select_bank(*bank);
                }
            }

            DjAction::SamplerVolume => {
                let vol = (value as f32) / 127.0;
                engine.sampler().set_master_volume(vol);
            }

            // ---- FX Controls ----
            DjAction::FxToggle { chain, slot } => {
                if is_press {
                    let fx_st = engine.fx_status();
                    let enabled = fx_st
                        .chains
                        .get(*chain)
                        .and_then(|c| c.slots.get(*slot))
                        .map(|s| s.enabled)
                        .unwrap_or(false);

                    engine.apply_fx(FxSlotUpdate {
                        chain: *chain as u8,
                        slot: *slot as u8,
                        fx_type: None,
                        enabled: Some(!enabled),
                        wet: None,
                        p1: None,
                        p2: None,
                        p3: None,
                    });
                }
            }

            DjAction::FxWetDry { chain, slot } => {
                let wet = (value as f32) / 127.0;
                engine.apply_fx(FxSlotUpdate {
                    chain: *chain as u8,
                    slot: *slot as u8,
                    fx_type: None,
                    enabled: None,
                    wet: Some(wet),
                    p1: None,
                    p2: None,
                    p3: None,
                });
            }

            // ---- Browser & Library Controls ----
            DjAction::BrowserScroll { .. } | DjAction::BrowserLoadDeck { .. } => {}
        }

        // Kirim LED hardware feedback
        Self::send_action_feedback(action, engine, dev);
    }

    /// Mengirim sinyal LED feedback kembali ke controller fisik sesuai status terkini.
    pub fn send_action_feedback(
        action: &DjAction,
        engine: &AudioEngine,
        dev: &mut MidiDeviceManager,
    ) {
        if dev.connected_output().is_none() {
            return;
        }

        match action {
            DjAction::DeckPlay { deck } => {
                if let Ok(d) = engine.deck(*deck) {
                    let ch = *deck as u8;
                    let _ = dev.send_led(ch, 11, false, d.status().playing);
                }
            }
            DjAction::DeckCue { deck } => {
                if let Ok(d) = engine.deck(*deck) {
                    let ch = *deck as u8;
                    let _ = dev.send_led(ch, 12, false, d.status().cue_secs > 0.0);
                }
            }
            DjAction::DeckSync { deck } => {
                let ch = *deck as u8;
                let _ = dev.send_led(ch, 88, false, true);
            }
            DjAction::DeckLoopToggle { deck } => {
                if let Ok(d) = engine.deck(*deck) {
                    let ch = *deck as u8;
                    let _ = dev.send_led(ch, 16, false, d.status().loop_active);
                }
            }
            DjAction::MixerPfl { deck } => {
                let ch = *deck as u8;
                let mx = engine.mixer_status();
                let pfl = mx.channels.get(*deck).map(|c| c.pfl).unwrap_or(false);
                let _ = dev.send_led(ch, 84, false, pfl);
            }
            _ => {}
        }
    }

    /// Sinkronisasi penuh semua status LED controller saat terhubung pertama kali.
    pub fn sync_all_leds(
        engine: &AudioEngine,
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
                    if let Ok(d) = engine.deck(*deck) {
                        let _ = dev.send_led(m.channel, m.control, is_cc, d.status().playing);
                    }
                }
                DjAction::DeckCue { deck } => {
                    if let Ok(d) = engine.deck(*deck) {
                        let _ = dev.send_led(
                            m.channel,
                            m.control,
                            is_cc,
                            d.status().cue_secs > 0.0,
                        );
                    }
                }
                DjAction::DeckLoopToggle { deck } => {
                    if let Ok(d) = engine.deck(*deck) {
                        let _ = dev.send_led(m.channel, m.control, is_cc, d.status().loop_active);
                    }
                }
                DjAction::MixerPfl { deck } => {
                    let mx = engine.mixer_status();
                    let pfl = mx.channels.get(*deck).map(|c| c.pfl).unwrap_or(false);
                    let _ = dev.send_led(m.channel, m.control, is_cc, pfl);
                }
                DjAction::DeckHotCue { deck, index } => {
                    if let Ok(d) = engine.deck(*deck) {
                        let has_cue = d
                            .status()
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

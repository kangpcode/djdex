//! Manajer sentral MIDI & Keyboard yang mengoordinasikan perangkat, pemetaan, dan eksekusi aksi.

use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;

use crate::audio::engine::AudioEngine;
use crate::audio::fx::FxSlotUpdate;
use crate::audio::mixer::MixerUpdate;

use super::device::MidiDeviceManager;
use super::dispatcher::MidiDispatcher;
use super::keyboard::KeyboardManager;
use super::mapping::MidiMappingManager;
use super::types::{
    DjAction, KeyboardBinding, MidiEvent, MidiLearnStatus, MidiMapping, MidiMessageType,
    MidiPortInfo, MidiStatus,
};

/// Manajer utama sistem MIDI & Keyboard mapping.
pub struct MidiManager {
    device: Mutex<MidiDeviceManager>,
    mapping: Mutex<MidiMappingManager>,
    keyboard: Mutex<KeyboardManager>,
    last_event: Mutex<Option<MidiEvent>>,
    engine: Arc<Mutex<Option<AudioEngine>>>,
}

impl MidiManager {
    pub fn new(
        presets_dir: Option<PathBuf>,
        engine: Arc<Mutex<Option<AudioEngine>>>,
    ) -> Arc<Self> {
        let mgr = Arc::new(Self {
            device: Mutex::new(MidiDeviceManager::new()),
            mapping: Mutex::new(MidiMappingManager::new(presets_dir)),
            keyboard: Mutex::new(KeyboardManager::new()),
            last_event: Mutex::new(None),
            engine,
        });

        mgr
    }

    /// Daftar port input MIDI yang tersedia.
    pub fn list_inputs(&self) -> Result<Vec<MidiPortInfo>, String> {
        MidiDeviceManager::list_inputs()
    }

    /// Daftar port output MIDI yang tersedia.
    pub fn list_outputs(&self) -> Result<Vec<MidiPortInfo>, String> {
        MidiDeviceManager::list_outputs()
    }

    /// Menghubungkan perangkat MIDI input dan/atau output.
    pub fn connect_device(
        self: &Arc<Self>,
        input_index: Option<usize>,
        output_index: Option<usize>,
    ) -> Result<MidiStatus, String> {
        let mut dev = self.device.lock();

        if let Some(in_idx) = input_index {
            let self_clone = Arc::clone(self);
            dev.connect_input(in_idx, move |event| {
                self_clone.handle_midi_event(event);
            })?;
        }

        if let Some(out_idx) = output_index {
            dev.connect_output(out_idx)?;

            // Sinkronisasi LED awal jika output terhubung
            drop(dev);
            self.sync_leds();
        }

        Ok(self.status())
    }

    /// Memutuskan koneksi perangkat MIDI aktif.
    pub fn disconnect_device(&self) -> MidiStatus {
        let mut dev = self.device.lock();
        dev.disconnect_input();
        dev.disconnect_output();
        drop(dev);
        self.status()
    }

    /// Snapshot status koneksi, preset, dan MIDI Learn saat ini.
    pub fn status(&self) -> MidiStatus {
        let dev = self.device.lock();
        let map = self.mapping.lock();
        let last = *self.last_event.lock();

        MidiStatus {
            connected_input: dev.connected_input().map(ToString::to_string),
            connected_output: dev.connected_output().map(ToString::to_string),
            is_learning: map.learn_status().is_learning,
            active_preset: map.active_preset().to_string(),
            mapping_count: map.get_mappings().len(),
            last_event: last,
        }
    }

    /// Mulai mode interaktif MIDI Learn untuk aksi target.
    pub fn start_learn(&self, action: DjAction) -> MidiLearnStatus {
        let mut map = self.mapping.lock();
        map.start_learn(action);
        map.learn_status().clone()
    }

    /// Batalkan proses MIDI Learn.
    pub fn cancel_learn(&self) -> MidiLearnStatus {
        let mut map = self.mapping.lock();
        map.cancel_learn();
        map.learn_status().clone()
    }

    /// Mengambil seluruh daftar pemetaan aktif.
    pub fn get_mappings(&self) -> Vec<MidiMapping> {
        self.mapping.lock().get_mappings()
    }

    /// Menambahkan atau memperbarui satu pemetaan MIDI.
    pub fn set_mapping(&self, mapping: MidiMapping) {
        self.mapping.lock().add_mapping(mapping);
    }

    /// Menghapus pemetaan berdasarkan id.
    pub fn remove_mapping(&self, id: &str) -> bool {
        self.mapping.lock().remove_mapping(id)
    }

    /// Menghapus seluruh pemetaan.
    pub fn clear_mappings(&self) {
        self.mapping.lock().clear_mappings();
    }

    /// Daftar seluruh preset yang ada (pabrikan + custom).
    pub fn list_presets(&self) -> Vec<String> {
        self.mapping.lock().list_presets()
    }

    /// Memuat salah satu preset.
    pub fn load_preset(&self, name: &str) -> Result<MidiStatus, String> {
        self.mapping.lock().load_preset(name)?;
        self.sync_leds();
        Ok(self.status())
    }

    /// Menyimpan pemetaan aktif ke preset kustom.
    pub fn save_preset(&self, name: &str) -> Result<MidiStatus, String> {
        self.mapping.lock().save_preset(name)?;
        Ok(self.status())
    }

    // ---- Keyboard Mapping ----

    /// Mengambil seluruh pemetaan keyboard.
    pub fn get_keyboard_bindings(&self) -> Vec<KeyboardBinding> {
        self.keyboard.lock().get_bindings()
    }

    /// Menambahkan atau memperbarui satu pemetaan keyboard.
    pub fn set_keyboard_binding(&self, binding: KeyboardBinding) {
        self.keyboard.lock().set_binding(binding);
    }

    /// Menghapus pemetaan keyboard.
    pub fn remove_keyboard_binding(&self, key: &str, ctrl: bool, shift: bool, alt: bool) -> bool {
        self.keyboard.lock().remove_binding(key, ctrl, shift, alt)
    }

    /// Mengembalikan pemetaan keyboard ke pengaturan standar pabrik.
    pub fn reset_keyboard_bindings(&self) -> Vec<KeyboardBinding> {
        let mut kb = self.keyboard.lock();
        kb.reset_to_factory();
        kb.get_bindings()
    }

    /// Menangani penekanan tombol keyboard dari antarmuka pengguna.
    pub fn handle_keyboard_shortcut(
        &self,
        key: &str,
        ctrl: bool,
        shift: bool,
        alt: bool,
    ) -> Result<Option<DjAction>, String> {
        let action = self.keyboard.lock().find_action(key, ctrl, shift, alt);

        if let Some(act) = &action {
            self.dispatch_action(act, 127);
        }

        Ok(action)
    }

    /// Menangani event biner MIDI yang masuk dari port input fisik/virtual.
    pub fn handle_midi_event(&self, event: MidiEvent) {
        *self.last_event.lock() = Some(event);

        let (_mapping, action) = self.mapping.lock().process_event(&event);

        if let Some(act) = action {
            self.dispatch_action(&act, event.value);
        }
    }

    /// Menjalankan aksi ke engine audio dan memperbarui LED hardware jika aktif.
    pub fn dispatch_action(&self, action: &DjAction, value: u8) {
        let is_press = value > 0;
        let guard = self.engine.lock();

        if let Some(engine) = guard.as_ref() {
            match action {
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
                            let current_beats = st.loop_length_beats.unwrap_or(4.0);
                            let new_beats = (current_beats * 0.5).max(0.25);
                            let start = st.loop_in_secs.unwrap_or(st.position_secs);
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
                            let current_beats = st.loop_length_beats.unwrap_or(4.0);
                            let new_beats = (current_beats * 2.0).min(64.0);
                            let start = st.loop_in_secs.unwrap_or(st.position_secs);
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

                // Mixer
                DjAction::MixerFader { deck } => {
                    let vol = (value as f32) / 127.0;
                    let fader = if *deck == 0 {
                        [Some(vol), None]
                    } else {
                        [None, Some(vol)]
                    };
                    engine.apply_mixer(MixerUpdate {
                        fader: Some(fader),
                        ..Default::default()
                    });
                }
                DjAction::MixerCrossfader => {
                    let xf = ((value as f32) - 64.0) / 64.0;
                    engine.apply_mixer(MixerUpdate {
                        crossfader: Some(xf.clamp(-1.0, 1.0)),
                        ..Default::default()
                    });
                }
                DjAction::MixerEqLow { deck } => {
                    let gain = (value as f32) / 64.0;
                    let eq = if *deck == 0 {
                        [Some([Some(gain), None, None]), None]
                    } else {
                        [None, Some([Some(gain), None, None])]
                    };
                    engine.apply_mixer(MixerUpdate {
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
                    engine.apply_mixer(MixerUpdate {
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
                    engine.apply_mixer(MixerUpdate {
                        eq_gain: Some(eq),
                        ..Default::default()
                    });
                }
                DjAction::MixerFilter { deck } => {
                    let filter = ((value as f32) - 64.0) / 64.0;
                    let filt = if *deck == 0 {
                        [Some(filter.clamp(-1.0, 1.0)), None]
                    } else {
                        [None, Some(filter.clamp(-1.0, 1.0))]
                    };
                    engine.apply_mixer(MixerUpdate {
                        filter: Some(filt),
                        ..Default::default()
                    });
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
                        let mut new_pfl = current.headphone.pfl;
                        if pfl_idx < new_pfl.len() {
                            new_pfl[pfl_idx] = !new_pfl[pfl_idx];
                        }
                        engine.apply_mixer(MixerUpdate {
                            headphone_pfl: Some(new_pfl),
                            ..Default::default()
                        });
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
                        headphone_volume: Some(vol),
                        ..Default::default()
                    });
                }
                DjAction::MixerCueMix => {
                    let mix = (value as f32) / 127.0;
                    engine.apply_mixer(MixerUpdate {
                        headphone_mix: Some(mix),
                        ..Default::default()
                    });
                }

                // Sampler
                DjAction::SamplerPad { pad } => {
                    if is_press {
                        let vel = (value as f32) / 127.0;
                        let _ = engine.sampler().trigger(*pad, Some(vel));
                    } else {
                        let _ = engine.sampler().release(*pad);
                    }
                }
                DjAction::SamplerBankSelect { bank } => {
                    if is_press {
                        let _ = engine.sampler().select_bank(*bank);
                    }
                }
                DjAction::SamplerVolume => {
                    let vol = (value as f32) / 127.0;
                    engine.sampler().set_master_volume(vol);
                }

                // FX
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
                    engine.apply_fx(FxSlotUpdate {
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

                // Browser navigation
                DjAction::BrowserScroll { .. } | DjAction::BrowserLoadDeck { .. } => {}
            }

            // Pembaruan LED feedback perangkat
            self.send_feedback_for_action(action, engine);
        }
    }

    /// Kirim LED feedback untuk aksi tertentu ke controller hardware.
    fn send_feedback_for_action(&self, action: &DjAction, engine: &AudioEngine) {
        let mut dev = self.device.lock();
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
                    let _ = dev.send_led(ch, 12, false, d.status().cue_position_secs.is_some());
                }
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
                let pfl = mx.headphone.pfl.get(*deck).copied().unwrap_or(false);
                let _ = dev.send_led(ch, 84, false, pfl);
            }
            _ => {}
        }
    }

    /// Sinkronisasi seluruh status LED controller hardware saat tersambung.
    pub fn sync_leds(&self) {
        let mut dev = self.device.lock();
        if dev.connected_output().is_none() {
            return;
        }

        let guard = self.engine.lock();
        if let Some(engine) = guard.as_ref() {
            let mappings = self.mapping.lock().get_mappings();
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
                                d.status().cue_position_secs.is_some(),
                            );
                        }
                    }
                    DjAction::DeckLoopToggle { deck } => {
                        if let Ok(d) = engine.deck(*deck) {
                            let _ = dev.send_led(
                                m.channel,
                                m.control,
                                is_cc,
                                d.status().loop_active,
                            );
                        }
                    }
                    DjAction::MixerPfl { deck } => {
                        let mx = engine.mixer_status();
                        let pfl = mx.headphone.pfl.get(*deck).copied().unwrap_or(false);
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
}

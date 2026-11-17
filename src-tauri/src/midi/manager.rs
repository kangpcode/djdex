//! Manajer sentral MIDI & Keyboard yang mengoordinasikan perangkat, pemetaan, dan eksekusi aksi.

use parking_lot::Mutex;
use std::path::PathBuf;
use std::sync::Arc;

use crate::audio::engine::AudioEngine;

use super::device::MidiDeviceManager;
use super::dispatcher::MidiDispatcher;
use super::keyboard::KeyboardManager;
use super::mapping::MidiMappingManager;
use super::types::{
    DjAction, KeyboardBinding, MidiEvent, MidiLearnStatus, MidiMapping, MidiPortInfo, MidiStatus,
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
    pub fn new(presets_dir: Option<PathBuf>, engine: Arc<Mutex<Option<AudioEngine>>>) -> Arc<Self> {
        Arc::new(Self {
            device: Mutex::new(MidiDeviceManager::new()),
            mapping: Mutex::new(MidiMappingManager::new(presets_dir)),
            keyboard: Mutex::new(KeyboardManager::new()),
            last_event: Mutex::new(None),
            engine,
        })
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
        let guard = self.engine.lock();
        if let Some(engine) = guard.as_ref() {
            let mut dev = self.device.lock();
            MidiDispatcher::dispatch(action, value, engine, &mut dev);
        }
    }

    /// Sinkronisasi seluruh status LED controller hardware saat tersambung.
    pub fn sync_leds(&self) {
        let guard = self.engine.lock();
        if let Some(engine) = guard.as_ref() {
            let mut dev = self.device.lock();
            let mappings = self.mapping.lock().get_mappings();
            MidiDispatcher::sync_all_leds(engine, &mut dev, &mappings);
        }
    }
}

//! Pengelola pemetaan MIDI (Mapping Manager), preset controller populer, dan MIDI Learn engine.

use std::fs;
use std::path::{Path, PathBuf};

use super::types::{DjAction, JogWheelMode, MidiEvent, MidiLearnStatus, MidiMapping, MidiMessageType};

pub const FACTORY_PRESET_PIONEER: &str = "Pioneer DDJ-400 / DDJ-FLX4";
pub const FACTORY_PRESET_HERCULES: &str = "Hercules DJControl Inpulse";
pub const FACTORY_PRESET_GENERIC: &str = "Generic 2-Deck DJ Controller";

/// Pengelola tabel pemetaan MIDI dan preset perangkat.
#[derive(Debug, Clone)]
pub struct MidiMappingManager {
    mappings: Vec<MidiMapping>,
    active_preset: String,
    learn_status: MidiLearnStatus,
    presets_dir: Option<PathBuf>,
}

impl Default for MidiMappingManager {
    fn default() -> Self {
        Self::new(None)
    }
}

impl MidiMappingManager {
    pub fn new(presets_dir: Option<PathBuf>) -> Self {
        let mut mgr = Self {
            mappings: Vec::new(),
            active_preset: FACTORY_PRESET_PIONEER.to_string(),
            learn_status: MidiLearnStatus::default(),
            presets_dir,
        };
        // Muat preset default Pioneer DDJ-400 / FLX4
        mgr.load_factory_preset(FACTORY_PRESET_PIONEER);
        mgr
    }

    /// Mulai mode MIDI Learn interaktif untuk satu aksi DJ yang dipilih.
    pub fn start_learn(&mut self, action: DjAction) {
        self.learn_status = MidiLearnStatus {
            is_learning: true,
            target_action: Some(action),
            last_event: None,
        };
    }

    /// Batalkan mode MIDI Learn.
    pub fn cancel_learn(&mut self) {
        self.learn_status = MidiLearnStatus::default();
    }

    /// Mengambil status MIDI Learn saat ini.
    pub fn learn_status(&self) -> &MidiLearnStatus {
        &self.learn_status
    }

    /// Memproses event MIDI masuk:
    /// - Jika dalam mode MIDI Learn, langsung memetakan event ke target aksi.
    /// - Jika dalam mode normal, mencari aksi DJ yang sesuai.
    pub fn process_event(
        &mut self,
        event: &MidiEvent,
    ) -> (Option<MidiMapping>, Option<DjAction>) {
        if self.learn_status.is_learning {
            // Hindari NoteOff atau NoteOn velocity 0 saat proses learning tombol
            if event.message_type == MidiMessageType::NoteOff
                || (event.message_type == MidiMessageType::NoteOn && event.value == 0)
            {
                return (None, None);
            }

            if let Some(target_action) = self.learn_status.target_action.take() {
                self.learn_status.is_learning = false;
                self.learn_status.last_event = Some(*event);

                let id = format!(
                    "learn_{}_{}_{:?}",
                    event.channel, event.control, event.message_type
                );
                let mapping = MidiMapping {
                    id,
                    channel: event.channel,
                    message_type: event.message_type,
                    control: event.control,
                    action: target_action,
                    description: Some(format!(
                        "Learned Ch {} Ctrl {} ({:?})",
                        event.channel, event.control, event.message_type
                    )),
                };

                self.add_mapping(mapping.clone());
                let action = mapping.action.clone();
                return (Some(mapping), Some(action));
            }
        }

        // Cari pemetaan aktif
        let found = self.find_mapping(event).cloned();
        let action = found.as_ref().map(|m| m.action.clone());
        (found, action)
    }

    /// Mencari pemetaan yang cocok dengan event MIDI.
    pub fn find_mapping(&self, event: &MidiEvent) -> Option<&MidiMapping> {
        self.mappings.iter().find(|m| {
            m.channel == event.channel
                && (m.message_type == event.message_type
                    // Tombol NoteOn tetap menerima NoteOff untuk event release
                    || (m.message_type == MidiMessageType::NoteOn
                        && event.message_type == MidiMessageType::NoteOff))
                && m.control == event.control
        })
    }

    /// Menambahkan pemetaan baru (menimpa pemetaan lama jika ada benturan channel + message_type + control).
    pub fn add_mapping(&mut self, mapping: MidiMapping) {
        self.mappings.retain(|m| {
            !(m.channel == mapping.channel
                && m.message_type == mapping.message_type
                && m.control == mapping.control)
        });
        self.mappings.push(mapping);
    }

    /// Menghapus pemetaan berdasarkan id.
    pub fn remove_mapping(&mut self, id: &str) -> bool {
        let prev_len = self.mappings.len();
        self.mappings.retain(|m| m.id != id);
        self.mappings.len() < prev_len
    }

    /// Mengosongkan seluruh pemetaan aktif.
    pub fn clear_mappings(&mut self) {
        self.mappings.clear();
    }

    /// Mengambil salinan daftar seluruh pemetaan aktif.
    pub fn get_mappings(&self) -> Vec<MidiMapping> {
        self.mappings.clone()
    }

    /// Nama preset aktif saat ini.
    pub fn active_preset(&self) -> &str {
        &self.active_preset
    }

    /// Menemukan semua daftar preset yang tersedia (pabrikan + file custom pengguna).
    pub fn list_presets(&self) -> Vec<String> {
        let mut list = vec![
            FACTORY_PRESET_PIONEER.to_string(),
            FACTORY_PRESET_HERCULES.to_string(),
            FACTORY_PRESET_GENERIC.to_string(),
        ];

        if let Some(dir) = &self.presets_dir {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                            if !list.iter().any(|p| p == stem) {
                                list.push(stem.to_string());
                            }
                        }
                    }
                }
            }
        }

        list
    }

    /// Memuat salah satu preset (pabrikan atau file custom).
    pub fn load_preset(&mut self, name: &str) -> Result<(), String> {
        match name {
            FACTORY_PRESET_PIONEER => {
                self.load_factory_preset(FACTORY_PRESET_PIONEER);
                Ok(())
            }
            FACTORY_PRESET_HERCULES => {
                self.load_factory_preset(FACTORY_PRESET_HERCULES);
                Ok(())
            }
            FACTORY_PRESET_GENERIC => {
                self.load_factory_preset(FACTORY_PRESET_GENERIC);
                Ok(())
            }
            custom => {
                if let Some(dir) = &self.presets_dir {
                    let file_path = dir.join(format!("{}.json", custom));
                    if file_path.exists() {
                        let content = fs::read_to_string(&file_path)
                            .map_err(|e| format!("Gagal membaca file preset: {}", e))?;
                        let mappings: Vec<MidiMapping> = serde_json::from_str(&content)
                            .map_err(|e| format!("Format JSON preset tidak valid: {}", e))?;
                        self.mappings = mappings;
                        self.active_preset = custom.to_string();
                        return Ok(());
                    }
                }
                Err(format!("Preset '{}' tidak ditemukan", name))
            }
        }
    }

    /// Menyimpan pemetaan aktif ke file JSON preset kustom.
    pub fn save_preset(&mut self, name: &str) -> Result<(), String> {
        let dir = self
            .presets_dir
            .as_ref()
            .ok_or_else(|| "Direktori penyimpanan preset belum dikonfigurasi".to_string())?;

        fs::create_dir_all(dir).map_err(|e| format!("Gagal membuat folder preset: {}", e))?;
        let file_path = dir.join(format!("{}.json", name));

        let json = serde_json::to_string_pretty(&self.mappings)
            .map_err(|e| format!("Gagal serialisasi preset: {}", e))?;

        fs::write(&file_path, json).map_err(|e| format!("Gagal menulis file preset: {}", e))?;
        self.active_preset = name.to_string();

        Ok(())
    }

    fn load_factory_preset(&mut self, name: &str) {
        self.mappings.clear();
        self.active_preset = name.to_string();

        match name {
            FACTORY_PRESET_PIONEER => {
                self.populate_pioneer_ddj400();
            }
            FACTORY_PRESET_HERCULES => {
                self.populate_hercules_inpulse();
            }
            FACTORY_PRESET_GENERIC => {
                self.populate_generic_2deck();
            }
            _ => self.populate_pioneer_ddj400(),
        }
    }

    /// Pemetaan pabrik Pioneer DDJ-400 / DDJ-FLX4
    /// Channel 0 = Deck 1, Channel 1 = Deck 2
    fn populate_pioneer_ddj400(&mut self) {
        for deck in 0..2 {
            let ch = deck as u8;

            // Transport
            self.mappings.push(MidiMapping {
                id: format!("ddj_play_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 11,
                action: DjAction::DeckPlay { deck },
                description: Some(format!("Deck {} Play/Pause", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_cue_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 12,
                action: DjAction::DeckCue { deck },
                description: Some(format!("Deck {} Cue", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_sync_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 88,
                action: DjAction::DeckSync { deck },
                description: Some(format!("Deck {} Sync", deck + 1)),
            });

            // Jog Wheel (Two's Complement)
            self.mappings.push(MidiMapping {
                id: format!("ddj_jog_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 33,
                action: DjAction::DeckJog {
                    deck,
                    mode: JogWheelMode::RelativeTwoComp,
                },
                description: Some(format!("Deck {} Jog Wheel", deck + 1)),
            });

            // Tempo Slider (Pitch Bend)
            self.mappings.push(MidiMapping {
                id: format!("ddj_tempo_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::PitchBend,
                control: 0,
                action: DjAction::DeckPitch { deck },
                description: Some(format!("Deck {} Tempo Slider", deck + 1)),
            });

            // Loop Controls
            self.mappings.push(MidiMapping {
                id: format!("ddj_loop_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 16,
                action: DjAction::DeckLoopToggle { deck },
                description: Some(format!("Deck {} Auto Loop", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_loophalf_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 17,
                action: DjAction::DeckLoopHalf { deck },
                description: Some(format!("Deck {} Loop 1/2x", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_loopdouble_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 18,
                action: DjAction::DeckLoopDouble { deck },
                description: Some(format!("Deck {} Loop 2x", deck + 1)),
            });

            // Hot Cues 1..8
            for cue in 0..8 {
                self.mappings.push(MidiMapping {
                    id: format!("ddj_hotcue_d{}_c{}", deck, cue),
                    channel: ch,
                    message_type: MidiMessageType::NoteOn,
                    control: cue as u8,
                    action: DjAction::DeckHotCue { deck, index: cue },
                    description: Some(format!("Deck {} Hot Cue {}", deck + 1, cue + 1)),
                });
            }

            // Mixer Channel Strip
            self.mappings.push(MidiMapping {
                id: format!("ddj_fader_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 19,
                action: DjAction::MixerFader { deck },
                description: Some(format!("Deck {} Volume Fader", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_gain_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 4,
                action: DjAction::MixerGain { deck },
                description: Some(format!("Deck {} Gain/Trim", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_eqhi_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 7,
                action: DjAction::MixerEqHigh { deck },
                description: Some(format!("Deck {} EQ High", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_eqmid_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 8,
                action: DjAction::MixerEqMid { deck },
                description: Some(format!("Deck {} EQ Mid", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_eqlow_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 9,
                action: DjAction::MixerEqLow { deck },
                description: Some(format!("Deck {} EQ Low", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_filter_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 23,
                action: DjAction::MixerFilter { deck },
                description: Some(format!("Deck {} Sound Color Filter", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("ddj_pfl_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 84,
                action: DjAction::MixerPfl { deck },
                description: Some(format!("Deck {} Headphone Cue", deck + 1)),
            });

            // Browser Load Deck
            self.mappings.push(MidiMapping {
                id: format!("ddj_load_d{}", deck),
                channel: 0,
                message_type: MidiMessageType::NoteOn,
                control: 70 + deck as u8,
                action: DjAction::BrowserLoadDeck { deck },
                description: Some(format!("Load Selected Track to Deck {}", deck + 1)),
            });
        }

        // Global Crossfader & Mixer Master
        self.mappings.push(MidiMapping {
            id: "ddj_crossfader".to_string(),
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 8,
            action: DjAction::MixerCrossfader,
            description: Some("Mixer Crossfader".to_string()),
        });
        self.mappings.push(MidiMapping {
            id: "ddj_master_vol".to_string(),
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 10,
            action: DjAction::MixerMasterVolume,
            description: Some("Master Output Volume".to_string()),
        });
        self.mappings.push(MidiMapping {
            id: "ddj_cue_vol".to_string(),
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 12,
            action: DjAction::MixerCueVolume,
            description: Some("Headphones Cue Volume".to_string()),
        });
        self.mappings.push(MidiMapping {
            id: "ddj_cue_mix".to_string(),
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 13,
            action: DjAction::MixerCueMix,
            description: Some("Headphones Cue/Master Mixing".to_string()),
        });

        // Browser Scroll
        self.mappings.push(MidiMapping {
            id: "ddj_browser_scroll".to_string(),
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 65,
            action: DjAction::BrowserScroll { delta: 1 },
            description: Some("Library Rotary Browser Scroll".to_string()),
        });

        // Sampler Pads 1..8 (Channel 0, Notes 48..55)
        for pad in 0..8 {
            self.mappings.push(MidiMapping {
                id: format!("ddj_sampler_pad_{}", pad),
                channel: 0,
                message_type: MidiMessageType::NoteOn,
                control: 48 + pad as u8,
                action: DjAction::SamplerPad { pad },
                description: Some(format!("Sampler Trigger Pad {}", pad + 1)),
            });
        }
    }

    /// Pemetaan pabrik Hercules DJControl Inpulse 300 / 200
    fn populate_hercules_inpulse(&mut self) {
        for deck in 0..2 {
            let ch = deck as u8;

            self.mappings.push(MidiMapping {
                id: format!("herc_play_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 1,
                action: DjAction::DeckPlay { deck },
                description: Some(format!("Hercules Deck {} Play", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("herc_cue_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 2,
                action: DjAction::DeckCue { deck },
                description: Some(format!("Hercules Deck {} Cue", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("herc_sync_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 3,
                action: DjAction::DeckSync { deck },
                description: Some(format!("Hercules Deck {} Sync", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("herc_jog_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 33,
                action: DjAction::DeckJog {
                    deck,
                    mode: JogWheelMode::RelativeSignedBit,
                },
                description: Some(format!("Hercules Deck {} Jog Wheel", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("herc_fader_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 1,
                action: DjAction::MixerFader { deck },
                description: Some(format!("Hercules Deck {} Fader", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("herc_eqlow_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 2,
                action: DjAction::MixerEqLow { deck },
                description: Some(format!("Hercules Deck {} EQ Low", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("herc_eqmid_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 3,
                action: DjAction::MixerEqMid { deck },
                description: Some(format!("Hercules Deck {} EQ Mid", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("herc_eqhi_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 4,
                action: DjAction::MixerEqHigh { deck },
                description: Some(format!("Hercules Deck {} EQ High", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("herc_filter_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 5,
                action: DjAction::MixerFilter { deck },
                description: Some(format!("Hercules Deck {} Filter", deck + 1)),
            });

            for cue in 0..8 {
                self.mappings.push(MidiMapping {
                    id: format!("herc_hotcue_d{}_c{}", deck, cue),
                    channel: ch,
                    message_type: MidiMessageType::NoteOn,
                    control: 8 + cue as u8,
                    action: DjAction::DeckHotCue { deck, index: cue },
                    description: Some(format!("Hercules Deck {} Hot Cue {}", deck + 1, cue + 1)),
                });
            }
        }

        self.mappings.push(MidiMapping {
            id: "herc_crossfader".to_string(),
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 10,
            action: DjAction::MixerCrossfader,
            description: Some("Hercules Crossfader".to_string()),
        });
    }

    /// Pemetaan generik standar 2-Deck
    fn populate_generic_2deck(&mut self) {
        for deck in 0..2 {
            let ch = deck as u8;

            self.mappings.push(MidiMapping {
                id: format!("gen_play_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 60,
                action: DjAction::DeckPlay { deck },
                description: Some(format!("Generic Deck {} Play", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("gen_cue_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 62,
                action: DjAction::DeckCue { deck },
                description: Some(format!("Generic Deck {} Cue", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("gen_sync_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::NoteOn,
                control: 64,
                action: DjAction::DeckSync { deck },
                description: Some(format!("Generic Deck {} Sync", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("gen_jog_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 16,
                action: DjAction::DeckJog {
                    deck,
                    mode: JogWheelMode::RelativeBinaryOffset,
                },
                description: Some(format!("Generic Deck {} Jog Wheel", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("gen_fader_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 20,
                action: DjAction::MixerFader { deck },
                description: Some(format!("Generic Deck {} Fader", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("gen_eqlow_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 21,
                action: DjAction::MixerEqLow { deck },
                description: Some(format!("Generic Deck {} EQ Low", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("gen_eqmid_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 22,
                action: DjAction::MixerEqMid { deck },
                description: Some(format!("Generic Deck {} EQ Mid", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("gen_eqhi_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 23,
                action: DjAction::MixerEqHigh { deck },
                description: Some(format!("Generic Deck {} EQ High", deck + 1)),
            });
            self.mappings.push(MidiMapping {
                id: format!("gen_filter_d{}", deck),
                channel: ch,
                message_type: MidiMessageType::ControlChange,
                control: 24,
                action: DjAction::MixerFilter { deck },
                description: Some(format!("Generic Deck {} Filter", deck + 1)),
            });
        }

        self.mappings.push(MidiMapping {
            id: "gen_crossfader".to_string(),
            channel: 0,
            message_type: MidiMessageType::ControlChange,
            control: 28,
            action: DjAction::MixerCrossfader,
            description: Some("Generic Crossfader".to_string()),
        });
    }
}

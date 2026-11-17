//! Tipe data MIDI, format event, model aksi DJ, dan struktur pemetaan.

use serde::{Deserialize, Serialize};

/// Informasi port perangkat MIDI fisik/virtual.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiPortInfo {
    pub id: usize,
    pub name: String,
}

/// Tipe pesan MIDI standar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MidiMessageType {
    NoteOn,
    NoteOff,
    ControlChange,
    PitchBend,
}

/// Satu event MIDI mentah yang terurai.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiEvent {
    pub channel: u8,
    pub message_type: MidiMessageType,
    pub control: u8,
    pub value: u8,
}

impl MidiEvent {
    /// Parsing pesan biner MIDI standar (1–3 byte).
    pub fn parse(bytes: &[u8]) -> Option<Self> {
        if bytes.is_empty() {
            return None;
        }

        let status = bytes[0];
        if status < 0x80 {
            return None;
        }

        let channel = status & 0x0F;
        let command = status & 0xF0;

        match command {
            0x80 => {
                let control = bytes.get(1).copied().unwrap_or(0);
                let value = bytes.get(2).copied().unwrap_or(0);
                Some(Self {
                    channel,
                    message_type: MidiMessageType::NoteOff,
                    control,
                    value,
                })
            }
            0x90 => {
                let control = bytes.get(1).copied().unwrap_or(0);
                let value = bytes.get(2).copied().unwrap_or(0);
                // Velocity 0 dianggap sebagai NoteOff di standar MIDI
                let message_type = if value == 0 {
                    MidiMessageType::NoteOff
                } else {
                    MidiMessageType::NoteOn
                };
                Some(Self {
                    channel,
                    message_type,
                    control,
                    value,
                })
            }
            0xB0 => {
                let control = bytes.get(1).copied().unwrap_or(0);
                let value = bytes.get(2).copied().unwrap_or(0);
                Some(Self {
                    channel,
                    message_type: MidiMessageType::ControlChange,
                    control,
                    value,
                })
            }
            0xE0 => {
                let lsb = bytes.get(1).copied().unwrap_or(0) as u16;
                let msb = bytes.get(2).copied().unwrap_or(0) as u16;
                let val14 = (msb << 7) | lsb;
                let value = (val14 >> 7) as u8; // Konversi ke rentang 0..127
                Some(Self {
                    channel,
                    message_type: MidiMessageType::PitchBend,
                    control: 0,
                    value,
                })
            }
            _ => None,
        }
    }

    /// Konversi event MIDI ke rentetan biner (1–3 byte) untuk dikirim ke perangkat (LED feedback).
    pub fn to_bytes(&self) -> Vec<u8> {
        let ch = self.channel & 0x0F;
        match self.message_type {
            MidiMessageType::NoteOff => vec![0x80 | ch, self.control & 0x7F, self.value & 0x7F],
            MidiMessageType::NoteOn => vec![0x90 | ch, self.control & 0x7F, self.value & 0x7F],
            MidiMessageType::ControlChange => vec![0xB0 | ch, self.control & 0x7F, self.value & 0x7F],
            MidiMessageType::PitchBend => {
                let val14 = ((self.value as u16) & 0x7F) << 7;
                let lsb = (val14 & 0x7F) as u8;
                let msb = ((val14 >> 7) & 0x7F) as u8;
                vec![0xE0 | ch, lsb, msb]
            }
        }
    }
}

/// Mode decoding gerakan jog wheel relatif controller DJ.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum JogWheelMode {
    /// 7-bit two's complement: 0x01..0x3F = searah jarum jam (+), 0x7F..0x41 = berlawanan arah (-)
    #[default]
    RelativeTwoComp,
    /// Binary offset: 64 = diam, >64 = searah jarum jam (+), <64 = berlawanan arah (-)
    RelativeBinaryOffset,
    /// Signed magnitude: bit 6 sebagai tanda arah (0x01..0x3F = CW, 0x41..0x7F = CCW)
    RelativeSignedBit,
    /// Absolute 0..127
    Absolute,
}

impl JogWheelMode {
    /// Mengonversi nilai mentah CC 0..127 menjadi nilai delta pergeseran float (-1.0..+1.0).
    pub fn decode_delta(self, raw: u8) -> f32 {
        match self {
            Self::RelativeTwoComp => {
                if raw < 0x40 {
                    raw as f32
                } else {
                    (raw as i32 - 128) as f32
                }
            }
            Self::RelativeBinaryOffset => (raw as i32 - 64) as f32,
            Self::RelativeSignedBit => {
                let sign = if (raw & 0x40) != 0 { -1.0 } else { 1.0 };
                let magnitude = (raw & 0x3F) as f32;
                sign * magnitude
            }
            Self::Absolute => (raw as f32 - 64.0) / 64.0,
        }
    }
}

/// Model aksi DJ komprehensif yang dapat dipetakan dari hardware MIDI atau keyboard.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum DjAction {
    // ---- Deck Controls ----
    DeckPlay { deck: usize },
    DeckCue { deck: usize },
    DeckSync { deck: usize },
    DeckPitch { deck: usize },
    DeckPitchBend { deck: usize, direction: i8 },
    DeckJog { deck: usize, mode: JogWheelMode },
    DeckHotCue { deck: usize, index: usize },
    DeckLoopToggle { deck: usize },
    DeckLoopHalf { deck: usize },
    DeckLoopDouble { deck: usize },
    DeckBeatJump { deck: usize, beats: f64 },

    // ---- Mixer Controls ----
    MixerFader { deck: usize },
    MixerCrossfader,
    MixerEqLow { deck: usize },
    MixerEqMid { deck: usize },
    MixerEqHigh { deck: usize },
    MixerFilter { deck: usize },
    MixerGain { deck: usize },
    MixerPfl { deck: usize },
    MixerMasterVolume,
    MixerCueVolume,
    MixerCueMix,

    // ---- Sampler & Remixer Controls ----
    SamplerPad { pad: usize },
    SamplerBankSelect { bank: usize },
    SamplerVolume,

    // ---- FX Controls ----
    FxToggle { chain: usize, slot: usize },
    FxWetDry { chain: usize, slot: usize },

    // ---- Browser & Library Controls ----
    BrowserScroll { delta: i8 },
    BrowserLoadDeck { deck: usize },
}

/// Pemetaan satu event MIDI ke aksi DJ.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiMapping {
    pub id: String,
    pub channel: u8,
    pub message_type: MidiMessageType,
    pub control: u8,
    pub action: DjAction,
    pub description: Option<String>,
}

/// Status proses MIDI Learn aktif.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiLearnStatus {
    pub is_learning: bool,
    pub target_action: Option<DjAction>,
    pub last_event: Option<MidiEvent>,
}

/// Snapshot status MIDI secara keseluruhan untuk antarmuka pengguna.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiStatus {
    pub connected_input: Option<String>,
    pub connected_output: Option<String>,
    pub is_learning: bool,
    pub active_preset: String,
    pub mapping_count: usize,
    pub last_event: Option<MidiEvent>,
}

/// Satu pemetaan pintasan keyboard komputer ke aksi DJ.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardBinding {
    pub key: String,
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub action: DjAction,
    pub description: Option<String>,
}

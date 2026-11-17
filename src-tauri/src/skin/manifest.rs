//! Definisi manifest skin dan skema tata letak "Mesin Tampilan DJ Virtual".

use serde::{Deserialize, Serialize};

/// Ukuran piringan DJ (Jog Wheel / Vinyl Platter).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PlatterSize {
    Compact,
    #[default]
    Standard,
    LargeBattle,
}

/// Posisi waveform audio di layar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum WaveformPosition {
    #[default]
    TopStacked,
    DeckIntegrated,
    Bottom,
    Hidden,
}

/// Orientasi gelombang waveform audio.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum WaveformOrientation {
    #[default]
    Horizontal,
    Vertical,
}

/// Posisi modul mixer DJ.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum MixerPosition {
    #[default]
    Center,
    CompactBottom,
    Split,
}

/// Metadata identitas skin / template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinMetadata {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub description: String,
    pub preview_image: Option<String>,
}

/// Skema warna dan gaya grafis tema (Theme styling).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinTheme {
    pub primary_color: String,
    pub accent_deck_a: String,
    pub accent_deck_b: String,
    pub accent_deck_c: Option<String>,
    pub accent_deck_d: Option<String>,
    pub background_color: String,
    pub surface_color: String,
    pub panel_border_color: String,
    pub text_color: String,
    pub font_family: Option<String>,
    pub custom_css: Option<String>,
}

/// Konfigurasi visual jog wheel / vinyl platter.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatterStyle {
    pub size: PlatterSize,
    pub vinyl_texture: bool,
    pub center_display: bool,
}

impl Default for PlatterStyle {
    fn default() -> Self {
        Self {
            size: PlatterSize::Standard,
            vinyl_texture: true,
            center_display: true,
        }
    }
}

/// Konfigurasi tata letak visual waveform.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformLayout {
    pub position: WaveformPosition,
    pub orientation: WaveformOrientation,
    pub height_px: u32,
    pub show_beatgrid: bool,
}

impl Default for WaveformLayout {
    fn default() -> Self {
        Self {
            position: WaveformPosition::TopStacked,
            orientation: WaveformOrientation::Horizontal,
            height_px: 110,
            show_beatgrid: true,
        }
    }
}

/// Konfigurasi modul mixer DJ.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixerLayout {
    pub position: MixerPosition,
    pub channel_count: u8,
    pub vu_meter_style: String,
    pub crossfader_height_px: u32,
}

impl Default for MixerLayout {
    fn default() -> Self {
        Self {
            position: MixerPosition::Center,
            channel_count: 2,
            vu_meter_style: "segmented".to_string(),
            crossfader_height_px: 56,
        }
    }
}

/// Tata letak keseluruhan elemen workstation DJ (Layout Configuration).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinLayout {
    pub deck_count: u8,
    pub waveform: WaveformLayout,
    pub platter: PlatterStyle,
    pub mixer: MixerLayout,
    pub lower_panel_default: String,
    pub show_phase_strip: bool,
    pub show_scratch_pads: bool,
}

impl Default for SkinLayout {
    fn default() -> Self {
        Self {
            deck_count: 2,
            waveform: WaveformLayout::default(),
            platter: PlatterStyle::default(),
            mixer: MixerLayout::default(),
            lower_panel_default: "library".to_string(),
            show_phase_strip: true,
            show_scratch_pads: false,
        }
    }
}

/// Dokumen manifest lengkap untuk satu skin DJDeX.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinManifest {
    pub metadata: SkinMetadata,
    pub theme: SkinTheme,
    pub layout: SkinLayout,
}

impl SkinManifest {
    /// Parsing manifest dari JSON string.
    pub fn from_json(json_str: &str) -> Result<Self, String> {
        serde_json::from_str(json_str).map_err(|e| format!("Gagal mem-parse JSON skin: {}", e))
    }

    /// Serialisasi manifest ke JSON string dengan format rapi.
    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string_pretty(self)
            .map_err(|e| format!("Gagal serialisasi JSON skin: {}", e))
    }

    /// Parsing manifest dari TOML string.
    pub fn from_toml(toml_str: &str) -> Result<Self, String> {
        toml::from_str(toml_str).map_err(|e| format!("Gagal mem-parse TOML skin: {}", e))
    }

    /// Serialisasi manifest ke TOML string.
    pub fn to_toml(&self) -> Result<String, String> {
        toml::to_string_pretty(self).map_err(|e| format!("Gagal serialisasi TOML skin: {}", e))
    }

    // ---- 4 Factory Presets Bawaan ----

    /// Template 1: "Classic Club" (2 deck + mixer tengah, gaya CDJ + DJM standar club).
    pub fn classic_club() -> Self {
        Self {
            metadata: SkinMetadata {
                id: "classic-club".to_string(),
                name: "Classic Club".to_string(),
                author: "Kangpcode".to_string(),
                version: "1.0.0".to_string(),
                description:
                    "Tata letak standar klub profesional: 2 CDJ deck, mixer 2 channel di tengah, dan waveform bertumpuk di bagian atas."
                        .to_string(),
                preview_image: None,
            },
            theme: SkinTheme {
                primary_color: "#00e5ff".to_string(),
                accent_deck_a: "#00e5ff".to_string(),
                accent_deck_b: "#ff007f".to_string(),
                accent_deck_c: None,
                accent_deck_d: None,
                background_color: "#090d16".to_string(),
                surface_color: "#0e1526".to_string(),
                panel_border_color: "#1c2842".to_string(),
                text_color: "#f1f5f9".to_string(),
                font_family: Some("Inter, sans-serif".to_string()),
                custom_css: None,
            },
            layout: SkinLayout {
                deck_count: 2,
                waveform: WaveformLayout {
                    position: WaveformPosition::TopStacked,
                    orientation: WaveformOrientation::Horizontal,
                    height_px: 110,
                    show_beatgrid: true,
                },
                platter: PlatterStyle {
                    size: PlatterSize::Standard,
                    vinyl_texture: true,
                    center_display: true,
                },
                mixer: MixerLayout {
                    position: MixerPosition::Center,
                    channel_count: 2,
                    vu_meter_style: "segmented".to_string(),
                    crossfader_height_px: 56,
                },
                lower_panel_default: "library".to_string(),
                show_phase_strip: true,
                show_scratch_pads: false,
            },
        }
    }

    /// Template 2: "Battle Scratch" (Platter besar 12-inch, crossfader responsif, scratch pads, waveform vertikal).
    pub fn battle_scratch() -> Self {
        Self {
            metadata: SkinMetadata {
                id: "battle-scratch".to_string(),
                name: "Battle Scratch".to_string(),
                author: "Kangpcode".to_string(),
                version: "1.0.0".to_string(),
                description:
                    "Tata letak khusus turntablist / DJ battle: piringan vinyl ekstra besar, waveform vertikal berdampingan, dan crossfader dominan."
                        .to_string(),
                preview_image: None,
            },
            theme: SkinTheme {
                primary_color: "#eab308".to_string(), // Gold
                accent_deck_a: "#eab308".to_string(),
                accent_deck_b: "#ef4444".to_string(), // Crimson red
                accent_deck_c: None,
                accent_deck_d: None,
                background_color: "#0c0a09".to_string(), // Dark carbon
                surface_color: "#1c1917".to_string(),
                panel_border_color: "#44403c".to_string(),
                text_color: "#fafaf9".to_string(),
                font_family: Some("Inter, sans-serif".to_string()),
                custom_css: None,
            },
            layout: SkinLayout {
                deck_count: 2,
                waveform: WaveformLayout {
                    position: WaveformPosition::DeckIntegrated,
                    orientation: WaveformOrientation::Vertical,
                    height_px: 240,
                    show_beatgrid: true,
                },
                platter: PlatterStyle {
                    size: PlatterSize::LargeBattle,
                    vinyl_texture: true,
                    center_display: false,
                },
                mixer: MixerLayout {
                    position: MixerPosition::Center,
                    channel_count: 2,
                    vu_meter_style: "analog".to_string(),
                    crossfader_height_px: 72,
                },
                lower_panel_default: "sampler".to_string(),
                show_phase_strip: false,
                show_scratch_pads: true,
            },
        }
    }

    /// Template 3: "Producer Remix" (Fokus remixer, sampler 16-pad, step sequencer, FX chain, gaya cyber-synth).
    pub fn producer_remix() -> Self {
        Self {
            metadata: SkinMetadata {
                id: "producer-remix".to_string(),
                name: "Producer Remix".to_string(),
                author: "Kangpcode".to_string(),
                version: "1.0.0".to_string(),
                description:
                    "Tata letak bagi produser & live remixer: panel Sampler 16-Pad dan 16-Step Sequencer menjadi sorotan utama bersama modul FX."
                        .to_string(),
                preview_image: None,
            },
            theme: SkinTheme {
                primary_color: "#a855f7".to_string(), // Electric purple
                accent_deck_a: "#a855f7".to_string(),
                accent_deck_b: "#ec4899".to_string(), // Neon pink
                accent_deck_c: None,
                accent_deck_d: None,
                background_color: "#0f0b18".to_string(),
                surface_color: "#181329".to_string(),
                panel_border_color: "#30264d".to_string(),
                text_color: "#f8fafc".to_string(),
                font_family: Some("Inter, sans-serif".to_string()),
                custom_css: None,
            },
            layout: SkinLayout {
                deck_count: 2,
                waveform: WaveformLayout {
                    position: WaveformPosition::TopStacked,
                    orientation: WaveformOrientation::Horizontal,
                    height_px: 80,
                    show_beatgrid: true,
                },
                platter: PlatterStyle {
                    size: PlatterSize::Compact,
                    vinyl_texture: false,
                    center_display: true,
                },
                mixer: MixerLayout {
                    position: MixerPosition::CompactBottom,
                    channel_count: 2,
                    vu_meter_style: "gradient".to_string(),
                    crossfader_height_px: 48,
                },
                lower_panel_default: "sampler".to_string(),
                show_phase_strip: true,
                show_scratch_pads: true,
            },
        }
    }

    /// Template 4: "Four-Deck Pro" (Layout 4 deck A/C kiri, B/D kanan, mixer 4-channel).
    pub fn four_deck_pro() -> Self {
        Self {
            metadata: SkinMetadata {
                id: "four-deck-pro".to_string(),
                name: "Four-Deck Pro".to_string(),
                author: "Kangpcode".to_string(),
                version: "1.0.0".to_string(),
                description:
                    "Tata letak 4 deck workstation profesional: Deck A & C di sisi kiri, Deck B & D di sisi kanan, serta mixer 4-channel lengkap."
                        .to_string(),
                preview_image: None,
            },
            theme: SkinTheme {
                primary_color: "#38bdf8".to_string(), // Sky blue
                accent_deck_a: "#38bdf8".to_string(),
                accent_deck_b: "#f97316".to_string(), // Vivid orange
                accent_deck_c: "#10b981".to_string(), // Emerald
                accent_deck_d: "#f43f5e".to_string(), // Rose
                background_color: "#080c14".to_string(),
                surface_color: "#0f172a".to_string(),
                panel_border_color: "#1e293b".to_string(),
                text_color: "#f8fafc".to_string(),
                font_family: Some("Inter, sans-serif".to_string()),
                custom_css: None,
            },
            layout: SkinLayout {
                deck_count: 4,
                waveform: WaveformLayout {
                    position: WaveformPosition::TopStacked,
                    orientation: WaveformOrientation::Horizontal,
                    height_px: 96,
                    show_beatgrid: true,
                },
                platter: PlatterStyle {
                    size: PlatterSize::Compact,
                    vinyl_texture: true,
                    center_display: true,
                },
                mixer: MixerLayout {
                    position: MixerPosition::Center,
                    channel_count: 4,
                    vu_meter_style: "segmented".to_string(),
                    crossfader_height_px: 52,
                },
                lower_panel_default: "library".to_string(),
                show_phase_strip: true,
                show_scratch_pads: false,
            },
        }
    }
}

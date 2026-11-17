//! Pengelola pemetaan pintasan keyboard komputer (Keyboard Mapping Manager) ke aksi DJ.

use super::types::{DjAction, KeyboardBinding};

/// Manajer pintasan keyboard komputer untuk mengontrol fungsi DJDeX.
#[derive(Debug, Clone)]
pub struct KeyboardManager {
    bindings: Vec<KeyboardBinding>,
}

impl Default for KeyboardManager {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyboardManager {
    pub fn new() -> Self {
        let mut mgr = Self {
            bindings: Vec::new(),
        };
        mgr.reset_to_factory();
        mgr
    }

    /// Mencari aksi DJ yang cocok berdasarkan tombol dan tombol modifier yang ditekan.
    pub fn find_action(&self, key: &str, ctrl: bool, shift: bool, alt: bool) -> Option<DjAction> {
        let key_lower = key.to_lowercase();
        self.bindings
            .iter()
            .find(|b| {
                b.key.to_lowercase() == key_lower
                    && b.ctrl == ctrl
                    && b.shift == shift
                    && b.alt == alt
            })
            .map(|b| b.action.clone())
    }

    /// Menambahkan atau memperbarui pemetaan tombol keyboard.
    pub fn set_binding(&mut self, binding: KeyboardBinding) {
        let key_lower = binding.key.to_lowercase();
        self.bindings.retain(|b| {
            !(b.key.to_lowercase() == key_lower
                && b.ctrl == binding.ctrl
                && b.shift == binding.shift
                && b.alt == binding.alt)
        });
        self.bindings.push(binding);
    }

    /// Menghapus pemetaan tombol keyboard tertentu.
    pub fn remove_binding(&mut self, key: &str, ctrl: bool, shift: bool, alt: bool) -> bool {
        let key_lower = key.to_lowercase();
        let prev_len = self.bindings.len();
        self.bindings.retain(|b| {
            !(b.key.to_lowercase() == key_lower
                && b.ctrl == ctrl
                && b.shift == shift
                && b.alt == alt)
        });
        self.bindings.len() < prev_len
    }

    /// Mengambil semua daftar pemetaan tombol keyboard aktif.
    pub fn get_bindings(&self) -> Vec<KeyboardBinding> {
        self.bindings.clone()
    }

    /// Mengembalikan pemetaan ke pengaturan standar pabrik (Default Factory DJ Shortcuts).
    pub fn reset_to_factory(&mut self) {
        self.bindings.clear();

        // ---- Deck 1 Controls ----
        self.bindings.push(KeyboardBinding {
            key: "Space".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckPlay { deck: 0 },
            description: Some("Deck 1: Play / Pause".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "c".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckCue { deck: 0 },
            description: Some("Deck 1: Cue Point Jump/Set".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "s".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckSync { deck: 0 },
            description: Some("Deck 1: Sync BPM & Phase".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "q".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckPitchBend {
                deck: 0,
                direction: -1,
            },
            description: Some("Deck 1: Pitch Bend Slow Down".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "w".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckPitchBend {
                deck: 0,
                direction: 1,
            },
            description: Some("Deck 1: Pitch Bend Speed Up".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "e".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckLoopToggle { deck: 0 },
            description: Some("Deck 1: Loop On/Off".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "r".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckLoopHalf { deck: 0 },
            description: Some("Deck 1: Halve Loop Length".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "t".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckLoopDouble { deck: 0 },
            description: Some("Deck 1: Double Loop Length".to_string()),
        });

        // Hot Cues Deck 1: Keys 1..4
        for i in 0..4 {
            self.bindings.push(KeyboardBinding {
                key: (i + 1).to_string(),
                ctrl: false,
                shift: false,
                alt: false,
                action: DjAction::DeckHotCue { deck: 0, index: i },
                description: Some(format!("Deck 1: Hot Cue {}", i + 1)),
            });
        }

        // ---- Deck 2 Controls ----
        self.bindings.push(KeyboardBinding {
            key: "Space".to_string(),
            ctrl: false,
            shift: true,
            alt: false,
            action: DjAction::DeckPlay { deck: 1 },
            description: Some("Deck 2: Play / Pause".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "v".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckCue { deck: 1 },
            description: Some("Deck 2: Cue Point Jump/Set".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "b".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckSync { deck: 1 },
            description: Some("Deck 2: Sync BPM & Phase".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "u".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckPitchBend {
                deck: 1,
                direction: -1,
            },
            description: Some("Deck 2: Pitch Bend Slow Down".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "i".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckPitchBend {
                deck: 1,
                direction: 1,
            },
            description: Some("Deck 2: Pitch Bend Speed Up".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "o".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckLoopToggle { deck: 1 },
            description: Some("Deck 2: Loop On/Off".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "p".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckLoopHalf { deck: 1 },
            description: Some("Deck 2: Halve Loop Length".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "[".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::DeckLoopDouble { deck: 1 },
            description: Some("Deck 2: Double Loop Length".to_string()),
        });

        // Hot Cues Deck 2: Keys 5..8
        for i in 0..4 {
            self.bindings.push(KeyboardBinding {
                key: (i + 5).to_string(),
                ctrl: false,
                shift: false,
                alt: false,
                action: DjAction::DeckHotCue { deck: 1, index: i },
                description: Some(format!("Deck 2: Hot Cue {}", i + 1)),
            });
        }

        // ---- Browser Navigation ----
        self.bindings.push(KeyboardBinding {
            key: "ArrowUp".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::BrowserScroll { delta: -1 },
            description: Some("Library: Scroll Up".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "ArrowDown".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::BrowserScroll { delta: 1 },
            description: Some("Library: Scroll Down".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "Enter".to_string(),
            ctrl: false,
            shift: false,
            alt: false,
            action: DjAction::BrowserLoadDeck { deck: 0 },
            description: Some("Library: Load Selected Track to Deck 1".to_string()),
        });
        self.bindings.push(KeyboardBinding {
            key: "Enter".to_string(),
            ctrl: false,
            shift: true,
            alt: false,
            action: DjAction::BrowserLoadDeck { deck: 1 },
            description: Some("Library: Load Selected Track to Deck 2".to_string()),
        });

        // ---- Sampler Trigger Pads: F1..F8 ----
        for pad in 0..8 {
            self.bindings.push(KeyboardBinding {
                key: format!("F{}", pad + 1),
                ctrl: false,
                shift: false,
                alt: false,
                action: DjAction::SamplerPad { pad },
                description: Some(format!("Sampler: Trigger Pad {}", pad + 1)),
            });
        }
    }
}

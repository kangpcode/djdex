//! Kontrol FX lock-free untuk UI -> callback audio.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

use serde::{Deserialize, Serialize};

use crate::dsp::fx::{FxChainParams, FxParams, FxSlotParams, FxType};

fn store_f32(slot: &AtomicU32, value: f32) {
    slot.store(value.to_bits(), Ordering::Relaxed);
}

fn load_f32(slot: &AtomicU32) -> f32 {
    f32::from_bits(slot.load(Ordering::Relaxed))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FxSlotUpdate {
    pub chain: u8,
    pub slot: u8,
    pub fx_type: Option<FxType>,
    pub enabled: Option<bool>,
    pub wet: Option<f32>,
    pub p1: Option<f32>,
    pub p2: Option<f32>,
    pub p3: Option<f32>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FxUpdate {
    pub slot: Option<FxSlotUpdate>,
}

struct FxSlotControls {
    fx_type: AtomicU32,
    enabled: AtomicBool,
    wet: AtomicU32,
    p1: AtomicU32,
    p2: AtomicU32,
    p3: AtomicU32,
}

impl FxSlotControls {
    fn new(defaults: FxSlotParams) -> Self {
        Self {
            fx_type: AtomicU32::new(defaults.fx_type.to_code()),
            enabled: AtomicBool::new(defaults.enabled),
            wet: AtomicU32::new(defaults.wet.to_bits()),
            p1: AtomicU32::new(defaults.p1.to_bits()),
            p2: AtomicU32::new(defaults.p2.to_bits()),
            p3: AtomicU32::new(defaults.p3.to_bits()),
        }
    }

    fn params(&self) -> FxSlotParams {
        FxSlotParams {
            fx_type: FxType::from_code(self.fx_type.load(Ordering::Relaxed)),
            enabled: self.enabled.load(Ordering::Relaxed),
            wet: load_f32(&self.wet),
            p1: load_f32(&self.p1),
            p2: load_f32(&self.p2),
            p3: load_f32(&self.p3),
        }
    }

    fn apply(&self, update: &FxSlotUpdate) {
        if let Some(value) = update.fx_type {
            self.fx_type.store(value.to_code(), Ordering::Relaxed);
        }
        if let Some(value) = update.enabled {
            self.enabled.store(value, Ordering::Relaxed);
        }
        if let Some(value) = update.wet {
            store_f32(&self.wet, value.clamp(0.0, 1.0));
        }
        if let Some(value) = update.p1 {
            store_f32(&self.p1, value);
        }
        if let Some(value) = update.p2 {
            store_f32(&self.p2, value.clamp(0.0, 1.0));
        }
        if let Some(value) = update.p3 {
            store_f32(&self.p3, value.clamp(0.01, 32.0));
        }
    }
}

struct FxChainControls {
    slots: [FxSlotControls; 3],
}

impl FxChainControls {
    fn new() -> Self {
        Self {
            slots: [
                FxSlotControls::new(FxSlotParams::default()),
                FxSlotControls::new(FxSlotParams::default()),
                FxSlotControls::new(FxSlotParams::default()),
            ],
        }
    }

    fn params(&self) -> FxChainParams {
        FxChainParams {
            slots: [
                self.slots[0].params(),
                self.slots[1].params(),
                self.slots[2].params(),
            ],
        }
    }

    fn apply(&self, update: &FxSlotUpdate) {
        let slot = usize::from(update.slot.min(2));
        self.slots[slot].apply(update);
    }
}

pub struct FxControls {
    chains: [FxChainControls; 3],
}

impl FxControls {
    pub fn new() -> Self {
        Self {
            chains: [FxChainControls::new(), FxChainControls::new(), FxChainControls::new()],
        }
    }

    pub fn params(&self) -> FxParams {
        FxParams {
            chains: [
                self.chains[0].params(),
                self.chains[1].params(),
                self.chains[2].params(),
            ],
        }
    }

    pub fn apply(&self, update: &FxSlotUpdate) {
        let chain = usize::from(update.chain.min(2));
        self.chains[chain].apply(update);
    }
}

impl Default for FxControls {
    fn default() -> Self {
        Self::new()
    }
}

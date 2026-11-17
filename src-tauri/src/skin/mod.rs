//! Modul Mesin Tampilan / Skin Engine untuk DJDeX.

pub mod loader;
pub mod manifest;

#[cfg(test)]
mod tests;

pub use loader::{
    default_skins_dir, SkinManager, FACTORY_SKIN_BATTLE, FACTORY_SKIN_CLASSIC,
    FACTORY_SKIN_REMIX, FACTORY_SKIN_TOUR,
};
pub use manifest::{
    MixerLayout, MixerPosition, PlatterSize, PlatterStyle, SkinLayout, SkinManifest, SkinMetadata,
    SkinTheme, WaveformLayout, WaveformOrientation, WaveformPosition,
};

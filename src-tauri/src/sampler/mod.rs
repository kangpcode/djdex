//! Modul Sampler / Remixer dan Step Sequencer 16-step.

pub mod bank;
pub mod pad;
pub mod player;
pub mod sequencer;
pub mod synth;

pub use bank::{SampleBank, BANK_COUNT, PADS_PER_BANK};
pub use pad::{PadDto, PadMode, PadUpdate, SamplePad};
pub use player::{SamplerCommand, SamplerController, SamplerRt, SamplerStatus};
pub use sequencer::{
    Pattern, SequencerStatus, SequencerUpdate, StepSequencer, STEP_COUNT, TRACK_COUNT,
};

#[cfg(test)]
mod tests;

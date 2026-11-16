//! DSP dasar untuk mixer: biquad, EQ 3-band, filter satu knob.
//!
//! Efek (echo/reverb/flanger/...) dan loudness akan ditambahkan di fase FX.

pub mod biquad;
pub mod eq;
pub mod filter;
pub mod fx;

//! Enumerasi perangkat output dan pemilihan device berdasarkan nama.
//!
//! Catatan RT: modul ini hanya dipanggil dari thread non-RT (IPC / audio host),
//! tidak pernah dari callback audio.

use cpal::traits::{DeviceTrait, HostTrait};
use cpal::{Device, SampleFormat, SupportedBufferSize};
use serde::Serialize;

use crate::error::AudioError;

/// Label host API sesuai platform, dipakai untuk ditampilkan di UI.
pub fn host_label() -> &'static str {
    if cfg!(target_os = "windows") {
        "WASAPI"
    } else if cfg!(target_os = "macos") {
        "CoreAudio"
    } else if cfg!(target_os = "linux") {
        "ALSA"
    } else {
        "Audio"
    }
}

/// Nama pendek format sample untuk keperluan UI.
pub fn sample_format_label(format: SampleFormat) -> String {
    match format {
        SampleFormat::F32 => "f32".to_string(),
        SampleFormat::I16 => "i16".to_string(),
        SampleFormat::U16 => "u16".to_string(),
        other => format!("{other:?}").to_lowercase(),
    }
}

/// Cari device output berdasarkan nama. `None` berarti device default sistem.
pub fn find_output_device(name: Option<&str>) -> Result<Device, AudioError> {
    let host = cpal::default_host();

    match name.map(str::trim).filter(|name| !name.is_empty()) {
        None => host
            .default_output_device()
            .ok_or(AudioError::NoOutputDevice),
        Some(requested) => {
            let devices = host
                .output_devices()
                .map_err(|err| AudioError::Enumerate(err.to_string()))?;

            devices
                .into_iter()
                .find(|device| device.to_string() == requested)
                .ok_or_else(|| AudioError::DeviceNotFound(requested.to_string()))
        }
    }
}

/// Ringkasan satu perangkat output yang dikirim ke frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    /// Identifier praktis: nama device (stabil selama device tidak diganti nama).
    pub id: String,
    pub name: String,
    pub host: String,
    pub is_default: bool,
    pub max_channels: u16,
    /// Jumlah channel yang benar-benar diekspos perangkat sebagai konfigurasi
    /// output valid. UI hanya menawarkan angka di daftar ini sehingga ALSA tidak
    /// pernah diminta channel map yang tidak ada.
    pub supported_channels: Vec<u16>,
    pub sample_rates: Vec<u32>,
    pub sample_formats: Vec<String>,
    pub buffer_frames_min: Option<u32>,
    pub buffer_frames_max: Option<u32>,
    pub default_sample_rate: Option<u32>,
    pub default_channels: Option<u16>,
}

/// Daftar semua perangkat output beserta kapabilitasnya, default lebih dulu.
pub fn list_output_devices() -> Result<Vec<AudioDeviceInfo>, AudioError> {
    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .map(|device| device.to_string());
    let devices = host
        .output_devices()
        .map_err(|err| AudioError::Enumerate(err.to_string()))?;

    let mut result = Vec::new();

    for device in devices {
        let name = device.to_string();
        let is_default = default_name.as_deref() == Some(name.as_str());
        let mut info = AudioDeviceInfo {
            id: name.clone(),
            name,
            host: host_label().to_string(),
            is_default,
            max_channels: 0,
            supported_channels: Vec::new(),
            sample_rates: Vec::new(),
            sample_formats: Vec::new(),
            buffer_frames_min: None,
            buffer_frames_max: None,
            default_sample_rate: None,
            default_channels: None,
        };

        // Default config tidak selalu tersedia (mis. device "null"); tetap tampilkan device.
        if let Ok(default_config) = device.default_output_config() {
            let sample_rate = default_config.sample_rate();
            info.default_sample_rate = Some(sample_rate);
            info.default_channels = Some(default_config.channels());
            info.max_channels = info.max_channels.max(default_config.channels());
            push_channel(&mut info.supported_channels, default_config.channels());
            push_rate(&mut info.sample_rates, sample_rate);
            push_format(&mut info.sample_formats, default_config.sample_format());
        }

        if let Ok(ranges) = device.supported_output_configs() {
            for range in ranges {
                info.max_channels = info.max_channels.max(range.channels());
                push_channel(&mut info.supported_channels, range.channels());
                push_format(&mut info.sample_formats, range.sample_format());

                let min_rate = range.min_sample_rate();
                let max_rate = range.max_sample_rate();
                push_rate(&mut info.sample_rates, min_rate);
                push_rate(&mut info.sample_rates, max_rate);

                // Rate yang lazim dipakai DJ, hanya bila didukung device.
                for rate in [44_100u32, 48_000, 88_200, 96_000, 192_000] {
                    if rate >= min_rate && rate <= max_rate {
                        push_rate(&mut info.sample_rates, rate);
                    }
                }

                if let SupportedBufferSize::Range { min, max } = range.buffer_size() {
                    let min = *min;
                    let max = *max;
                    info.buffer_frames_min =
                        Some(info.buffer_frames_min.map_or(min, |v| v.min(min)));
                    info.buffer_frames_max =
                        Some(info.buffer_frames_max.map_or(max, |v| v.max(max)));
                }
            }
        }

        info.sample_rates.sort_unstable();
        info.supported_channels.sort_unstable();
        info.supported_channels.dedup();
        info.sample_formats.sort();
        info.sample_formats.dedup();
        result.push(info);
    }

    result.sort_by(|a, b| {
        b.is_default
            .cmp(&a.is_default)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(result)
}

fn push_rate(rates: &mut Vec<u32>, rate: u32) {
    if !rates.contains(&rate) {
        rates.push(rate);
    }
}

fn push_channel(channels: &mut Vec<u16>, channel: u16) {
    if channel > 0 && !channels.contains(&channel) {
        channels.push(channel);
    }
}

fn push_format(formats: &mut Vec<String>, format: SampleFormat) {
    let label = sample_format_label(format);
    if !formats.contains(&label) {
        formats.push(label);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_output_devices_returns_cleanly() {
        let devices = list_output_devices();
        assert!(devices.is_ok());
    }
}

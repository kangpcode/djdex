//! Enumerasi perangkat output dan pemilihan device berdasarkan nama atau ID unik.
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

/// Ambil string ID unik perangkat (mis. `"alsa:default"` atau `"alsa:plughw:CARD=..."`).
fn device_unique_id(device: &Device) -> String {
    device
        .id()
        .map(|id| id.to_string())
        .unwrap_or_else(|_| device.to_string())
}

/// Di Linux ALSA, filter alias PCM virtual/duplikat (`surround*`, `dmix`, `sysdefault`,
/// `front`, `null`, dan alias `CARD=<angka>`) yang memicu error `pcm_route` / `pcm_dmix`
/// saat enumerasi padahal sudah terwakili oleh `default`/`pipewire`/`plughw`/`hdmi`.
fn is_eligible_output_device(pcm_id: &str) -> bool {
    if !cfg!(target_os = "linux") {
        return true;
    }

    let raw = pcm_id.strip_prefix("alsa:").unwrap_or(pcm_id);

    if raw == "null"
        || raw.starts_with("surround")
        || raw.starts_with("dmix:")
        || raw.starts_with("sysdefault:")
        || raw.starts_with("front:")
        || raw.starts_with("hw:")
    {
        return false;
    }

    // Hilangkan duplikat numerik seperti `plughw:CARD=0,DEV=3` karena sudah ada `CARD=Generic`.
    if let Some(after_card) = raw.split("CARD=").nth(1) {
        let card_val = after_card.split(',').next().unwrap_or("");
        if !card_val.is_empty() && card_val.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
    }

    true
}

/// Format nama tampilan yang jelas agar dua PCM dari kartu yang sama tetap terbedakan.
fn format_display_name(device: &Device, unique_id: &str) -> String {
    let base = device.to_string();
    let raw = unique_id.strip_prefix("alsa:").unwrap_or(unique_id);
    if matches!(raw, "default" | "pipewire" | "pulse" | "jack") || !cfg!(target_os = "linux") {
        return base;
    }
    let tag = raw.split(':').next().unwrap_or(raw);
    format!("{base} [{tag}]")
}

/// Cari device output berdasarkan ID unik atau nama. `None` berarti device default sistem.
pub fn find_output_device(name: Option<&str>) -> Result<Device, AudioError> {
    let host = cpal::default_host();

    match name.map(str::trim).filter(|name| !name.is_empty()) {
        None => host
            .default_output_device()
            .ok_or(AudioError::NoOutputDevice),
        Some(requested) => {
            let devices: Vec<Device> = host
                .output_devices()
                .map_err(|err| AudioError::Enumerate(err.to_string()))?
                .collect();

            // Utamakan kecocokan exact pada ID unik (mis. "alsa:default", "alsa:plughw:...").
            if let Some(found) = devices
                .iter()
                .find(|device| device_unique_id(device) == requested)
                .cloned()
            {
                return Ok(found);
            }

            // Fallback untuk nama display atau ID tanpa prefix host.
            devices
                .into_iter()
                .find(|device| {
                    let uid = device_unique_id(device);
                    let raw = uid.strip_prefix("alsa:").unwrap_or(&uid);
                    raw == requested || device.to_string() == requested
                })
                .ok_or_else(|| AudioError::DeviceNotFound(requested.to_string()))
        }
    }
}

/// Ringkasan satu perangkat output yang dikirim ke frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    /// Identifier unik perangkat (mis. "alsa:default", "alsa:pipewire", atau nama host lain).
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
    let default_id = host.default_output_device().map(|d| device_unique_id(&d));
    let devices = host
        .output_devices()
        .map_err(|err| AudioError::Enumerate(err.to_string()))?;

    let mut result = Vec::new();

    for device in devices {
        let uid = device_unique_id(&device);
        let is_default = default_id.as_deref() == Some(uid.as_str());

        if !is_default && !is_eligible_output_device(&uid) {
            continue;
        }

        let name = format_display_name(&device, &uid);
        let mut info = AudioDeviceInfo {
            id: uid,
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

        // Panggil `supported_output_configs` cukup 1 kali saja (di cpal ALSA,
        // `default_output_config` secara internal mengulangi probing yang sama).
        if let Ok(ranges) = device.supported_output_configs() {
            let mut collected: Vec<_> = ranges.collect();
            for range in &collected {
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

            collected.sort_by(|a, b| a.cmp_default_heuristics(b));
            if let Some(best) = collected.into_iter().next_back() {
                let default_cfg = best
                    .try_with_standard_sample_rate()
                    .unwrap_or_else(|| best.with_max_sample_rate());
                info.default_sample_rate = Some(default_cfg.sample_rate());
                info.default_channels = Some(default_cfg.channels());
            }
        }

        // Di Linux, abaikan kartu/node yang tidak membuka output valid (kecuali default).
        if !is_default && info.supported_channels.is_empty() {
            continue;
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
    fn eligible_filter_skips_virtual_alsa_route_aliases() {
        if cfg!(target_os = "linux") {
            assert!(is_eligible_output_device("alsa:default"));
            assert!(is_eligible_output_device("alsa:pipewire"));
            assert!(is_eligible_output_device("alsa:plughw:CARD=Generic,DEV=3"));
            assert!(!is_eligible_output_device("alsa:null"));
            assert!(!is_eligible_output_device("alsa:surround51:CARD=Generic_1,DEV=0"));
            assert!(!is_eligible_output_device("alsa:dmix:CARD=Generic_1,DEV=0"));
            assert!(!is_eligible_output_device("alsa:plughw:CARD=0,DEV=3"));
        }
    }

    #[test]
    fn list_output_devices_returns_cleanly() {
        let devices = list_output_devices().expect("enumerate audio output devices");
        assert!(!devices.is_empty());
    }
}

//! Pengelola koneksi perangkat fisik/virtual MIDI (Input & Output) menggunakan `midir`.

use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};

use super::types::{MidiEvent, MidiMessageType, MidiPortInfo};

/// Manajer perangkat MIDI untuk koneksi port fisik atau virtual.
pub struct MidiDeviceManager {
    input_conn: Option<MidiInputConnection<()>>,
    output_conn: Option<MidiOutputConnection>,
    connected_input_name: Option<String>,
    connected_output_name: Option<String>,
}

impl Default for MidiDeviceManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MidiDeviceManager {
    pub fn new() -> Self {
        Self {
            input_conn: None,
            output_conn: None,
            connected_input_name: None,
            connected_output_name: None,
        }
    }

    /// Menemukan semua port input MIDI yang tersedia di sistem operasi.
    pub fn list_inputs() -> Result<Vec<MidiPortInfo>, String> {
        let midi_in = MidiInput::new("DJDeX-Input-Scanner").map_err(|e| e.to_string())?;
        let ports = midi_in.ports();
        let mut result = Vec::with_capacity(ports.len());

        for (id, port) in ports.iter().enumerate() {
            let name = midi_in
                .port_name(port)
                .unwrap_or_else(|_| format!("MIDI In {}", id));
            result.push(MidiPortInfo { id, name });
        }

        Ok(result)
    }

    /// Menemukan semua port output MIDI yang tersedia di sistem operasi.
    pub fn list_outputs() -> Result<Vec<MidiPortInfo>, String> {
        let midi_out = MidiOutput::new("DJDeX-Output-Scanner").map_err(|e| e.to_string())?;
        let ports = midi_out.ports();
        let mut result = Vec::with_capacity(ports.len());

        for (id, port) in ports.iter().enumerate() {
            let name = midi_out
                .port_name(port)
                .unwrap_or_else(|_| format!("MIDI Out {}", id));
            result.push(MidiPortInfo { id, name });
        }

        Ok(result)
    }

    /// Terhubung ke port input MIDI pada index yang ditentukan.
    pub fn connect_input<F>(&mut self, port_index: usize, callback: F) -> Result<String, String>
    where
        F: Fn(MidiEvent) + Send + 'static,
    {
        // Putuskan koneksi sebelumnya jika ada
        self.disconnect_input();

        let midi_in = MidiInput::new("DJDeX-Input-Client").map_err(|e| e.to_string())?;
        let ports = midi_in.ports();
        let port = ports
            .get(port_index)
            .ok_or_else(|| format!("Port input MIDI #{} tidak ditemukan", port_index))?;

        let port_name = midi_in
            .port_name(port)
            .unwrap_or_else(|_| format!("MIDI In {}", port_index));

        let conn = midi_in
            .connect(
                port,
                "djdex-in-conn",
                move |_timestamp, message, _| {
                    if let Some(event) = MidiEvent::parse(message) {
                        callback(event);
                    }
                },
                (),
            )
            .map_err(|e| e.to_string())?;

        self.input_conn = Some(conn);
        self.connected_input_name = Some(port_name.clone());

        Ok(port_name)
    }

    /// Memutuskan koneksi input MIDI yang sedang aktif.
    pub fn disconnect_input(&mut self) {
        if self.input_conn.is_some() {
            self.input_conn = None;
            self.connected_input_name = None;
        }
    }

    /// Terhubung ke port output MIDI untuk LED feedback.
    pub fn connect_output(&mut self, port_index: usize) -> Result<String, String> {
        self.disconnect_output();

        let midi_out = MidiOutput::new("DJDeX-Output-Client").map_err(|e| e.to_string())?;
        let ports = midi_out.ports();
        let port = ports
            .get(port_index)
            .ok_or_else(|| format!("Port output MIDI #{} tidak ditemukan", port_index))?;

        let port_name = midi_out
            .port_name(port)
            .unwrap_or_else(|_| format!("MIDI Out {}", port_index));

        let conn = midi_out
            .connect(port, "djdex-out-conn")
            .map_err(|e| e.to_string())?;

        self.output_conn = Some(conn);
        self.connected_output_name = Some(port_name.clone());

        Ok(port_name)
    }

    /// Memutuskan koneksi output MIDI yang sedang aktif.
    pub fn disconnect_output(&mut self) {
        if self.output_conn.is_some() {
            self.output_conn = None;
            self.connected_output_name = None;
        }
    }

    /// Mengirim pesan MIDI biner mentah ke perangkat output.
    pub fn send_raw(&mut self, bytes: &[u8]) -> Result<(), String> {
        if let Some(conn) = self.output_conn.as_mut() {
            conn.send(bytes).map_err(|e| e.to_string())
        } else {
            Err("Port output MIDI belum terhubung".to_string())
        }
    }

    /// Mengirim event MIDI terstruktur ke perangkat output.
    pub fn send_event(&mut self, event: &MidiEvent) -> Result<(), String> {
        self.send_raw(&event.to_bytes())
    }

    /// Mengirim status LED feedback (On = vel/val 127, Off = vel/val 0).
    pub fn send_led(
        &mut self,
        channel: u8,
        control: u8,
        is_cc: bool,
        on: bool,
    ) -> Result<(), String> {
        let value = if on { 127 } else { 0 };
        let message_type = if is_cc {
            MidiMessageType::ControlChange
        } else if on {
            MidiMessageType::NoteOn
        } else {
            MidiMessageType::NoteOff
        };

        let event = MidiEvent {
            channel,
            message_type,
            control,
            value,
        };
        self.send_event(&event)
    }

    pub fn connected_input(&self) -> Option<&str> {
        self.connected_input_name.as_deref()
    }

    pub fn connected_output(&self) -> Option<&str> {
        self.connected_output_name.as_deref()
    }
}

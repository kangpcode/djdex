//! Modul penyiaran langsung (Live Streaming Broadcast) ke server Icecast 2 / SHOUTcast.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use rtrb::{Consumer, Producer, RingBuffer};
use serde::{Deserialize, Serialize};

use crate::error::AudioError;

/// Protokol server streaming broadcast.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum BroadcastProtocol {
    #[default]
    Icecast2,
    Shoutcast,
}

/// Konfigurasi koneksi streaming ke server Icecast / SHOUTcast.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastConfig {
    pub server: String,
    pub mount: String,
    pub password: String,
    pub protocol: BroadcastProtocol,
    pub station_name: String,
    pub genre: String,
    pub description: String,
    pub bitrate_kbps: u32,
    pub is_public: bool,
}

impl Default for BroadcastConfig {
    fn default() -> Self {
        Self {
            server: "127.0.0.1:8000".to_string(),
            mount: "/live".to_string(),
            password: "hackme".to_string(),
            protocol: BroadcastProtocol::Icecast2,
            station_name: "DJDeX Live Stream".to_string(),
            genre: "Electronic / DJ Mix".to_string(),
            description: "Live DJ Mix Powered by DJDeX Workstation".to_string(),
            bitrate_kbps: 320,
            is_public: false,
        }
    }
}

/// Status terkini koneksi penyiaran langsung.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastStatus {
    pub is_streaming: bool,
    pub server_url: Option<String>,
    pub mount: Option<String>,
    pub duration_secs: f64,
    pub bytes_sent: u64,
    pub last_error: Option<String>,
}

/// Produser ring buffer audio RT untuk broadcast.
pub struct BroadcastProducer {
    producer: Producer<(f32, f32)>,
    is_streaming: Arc<AtomicBool>,
}

impl BroadcastProducer {
    #[inline]
    pub fn push(&mut self, left: f32, right: f32) {
        if self.is_streaming.load(Ordering::Relaxed) {
            let _ = self.producer.push((left, right));
        }
    }

    #[inline]
    pub fn is_active(&self) -> bool {
        self.is_streaming.load(Ordering::Relaxed)
    }
}

/// Pengendali sentral siaran langsung (Live Broadcast Controller).
pub struct BroadcastController {
    is_streaming: Arc<AtomicBool>,
    should_stop_thread: Arc<AtomicBool>,
    connect_requested: Arc<AtomicBool>,
    disconnect_requested: Arc<AtomicBool>,
    bytes_sent: Arc<AtomicU64>,
    start_time: Arc<Mutex<Option<Instant>>>,
    last_error: Arc<Mutex<Option<String>>>,
    active_config: Arc<Mutex<Option<BroadcastConfig>>>,
    sample_rate: u32,
    worker_handle: Mutex<Option<JoinHandle<()>>>,
}

impl BroadcastController {
    pub fn new(sample_rate: u32) -> (Arc<Self>, BroadcastProducer) {
        let (producer, consumer) = RingBuffer::<(f32, f32)>::new(131_072);

        let is_streaming = Arc::new(AtomicBool::new(false));
        let should_stop_thread = Arc::new(AtomicBool::new(false));
        let connect_requested = Arc::new(AtomicBool::new(false));
        let disconnect_requested = Arc::new(AtomicBool::new(false));
        let bytes_sent = Arc::new(AtomicU64::new(0));
        let start_time = Arc::new(Mutex::new(None));
        let last_error = Arc::new(Mutex::new(None));
        let active_config = Arc::new(Mutex::new(None));

        let controller = Arc::new(Self {
            is_streaming: Arc::clone(&is_streaming),
            should_stop_thread: Arc::clone(&should_stop_thread),
            connect_requested: Arc::clone(&connect_requested),
            disconnect_requested: Arc::clone(&disconnect_requested),
            bytes_sent: Arc::clone(&bytes_sent),
            start_time: Arc::clone(&start_time),
            last_error: Arc::clone(&last_error),
            active_config: Arc::clone(&active_config),
            sample_rate,
            worker_handle: Mutex::new(None),
        });

        let rt_producer = BroadcastProducer {
            producer,
            is_streaming: Arc::clone(&is_streaming),
        };

        controller.spawn_worker(consumer);

        (controller, rt_producer)
    }

    fn spawn_worker(&self, mut consumer: Consumer<(f32, f32)>) {
        let is_streaming = Arc::clone(&self.is_streaming);
        let should_stop_thread = Arc::clone(&self.should_stop_thread);
        let connect_requested = Arc::clone(&self.connect_requested);
        let disconnect_requested = Arc::clone(&self.disconnect_requested);
        let bytes_sent = Arc::clone(&self.bytes_sent);
        let start_time = Arc::clone(&self.start_time);
        let last_error = Arc::clone(&self.last_error);
        let active_config = Arc::clone(&self.active_config);
        let sample_rate = self.sample_rate;

        let handle = thread::Builder::new()
            .name("djdex-broadcast-worker".to_string())
            .spawn(move || {
                let mut active_tcp: Option<TcpStream> = None;
                let mut chunk_buffer = Vec::with_capacity(2048);

                while !should_stop_thread.load(Ordering::Relaxed) {
                    // Periksa permintaan disconnect
                    if disconnect_requested.swap(false, Ordering::SeqCst) {
                        active_tcp = None;
                        is_streaming.store(false, Ordering::SeqCst);
                        *start_time.lock() = None;
                    }

                    // Periksa permintaan connect
                    if connect_requested.swap(false, Ordering::SeqCst) {
                        let config_opt = active_config.lock().clone();
                        if let Some(config) = config_opt {
                            match connect_and_handshake(&config, sample_rate) {
                                Ok(stream) => {
                                    active_tcp = Some(stream);
                                    bytes_sent.store(0, Ordering::SeqCst);
                                    *start_time.lock() = Some(Instant::now());
                                    *last_error.lock() = None;
                                    is_streaming.store(true, Ordering::SeqCst);
                                }
                                Err(e) => {
                                    active_tcp = None;
                                    is_streaming.store(false, Ordering::SeqCst);
                                    *last_error.lock() = Some(e.to_string());
                                }
                            }
                        }
                    }

                    if let Some(ref mut stream) = active_tcp {
                        chunk_buffer.clear();
                        while let Ok((l, r)) = consumer.pop() {
                            let sl = (l.clamp(-1.0, 1.0) * 32767.0) as i16;
                            let sr = (r.clamp(-1.0, 1.0) * 32767.0) as i16;
                            chunk_buffer.extend_from_slice(&sl.to_le_bytes());
                            chunk_buffer.extend_from_slice(&sr.to_le_bytes());

                            if chunk_buffer.len() >= 2048 {
                                break;
                            }
                        }

                        if !chunk_buffer.is_empty() {
                            if let Err(e) = stream.write_all(&chunk_buffer) {
                                *last_error.lock() =
                                    Some(format!("Gagal streaming audio ke server: {}", e));
                                active_tcp = None;
                                is_streaming.store(false, Ordering::SeqCst);
                                *start_time.lock() = None;
                            } else {
                                bytes_sent.fetch_add(chunk_buffer.len() as u64, Ordering::Relaxed);
                            }
                        } else {
                            thread::sleep(Duration::from_millis(10));
                        }
                    } else {
                        // Jika sedang tidak streaming, buang sampel yang masuk
                        while consumer.pop().is_ok() {}
                        thread::sleep(Duration::from_millis(25));
                    }
                }
            })
            .expect("gagal membuat thread broadcast");

        *self.worker_handle.lock() = Some(handle);
    }

    /// Mulai siaran langsung ke server streaming yang ditentukan.
    pub fn start(&self, config: BroadcastConfig) -> Result<BroadcastStatus, AudioError> {
        if self.is_streaming.load(Ordering::SeqCst) {
            return Ok(self.status());
        }

        *self.active_config.lock() = Some(config);
        *self.last_error.lock() = None;
        self.disconnect_requested.store(false, Ordering::SeqCst);
        self.connect_requested.store(true, Ordering::SeqCst);

        // Tunggu hingga worker berhasil koneksi atau mengembalikan error (maksimal 3,5 detik)
        let timeout = Instant::now() + Duration::from_millis(3500);
        while Instant::now() < timeout {
            if self.is_streaming.load(Ordering::SeqCst) {
                return Ok(self.status());
            }
            if let Some(err) = self.last_error.lock().clone() {
                return Err(AudioError::Io(err));
            }
            thread::sleep(Duration::from_millis(25));
        }

        if let Some(err) = self.last_error.lock().clone() {
            Err(AudioError::Io(err))
        } else {
            Err(AudioError::Io(
                "Batas waktu koneksi ke server streaming habis".to_string(),
            ))
        }
    }

    /// Hentikan siaran langsung dan putuskan koneksi ke server.
    pub fn stop(&self) -> Result<BroadcastStatus, AudioError> {
        self.connect_requested.store(false, Ordering::SeqCst);
        self.disconnect_requested.store(true, Ordering::SeqCst);
        self.is_streaming.store(false, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(30));
        Ok(self.status())
    }

    /// Ambil status siaran terkini.
    pub fn status(&self) -> BroadcastStatus {
        let is_stream = self.is_streaming.load(Ordering::Relaxed);
        let bytes = self.bytes_sent.load(Ordering::Relaxed);
        let duration_secs = self
            .start_time
            .lock()
            .as_ref()
            .map(|t| t.elapsed().as_secs_f64())
            .unwrap_or(0.0);
        let guard_cfg = self.active_config.lock();
        let server_url = guard_cfg.as_ref().map(|c| c.server.clone());
        let mount = guard_cfg.as_ref().map(|c| c.mount.clone());
        let last_err = self.last_error.lock().clone();

        BroadcastStatus {
            is_streaming: is_stream,
            server_url,
            mount,
            duration_secs,
            bytes_sent: bytes,
            last_error: last_err,
        }
    }
}

impl Drop for BroadcastController {
    fn drop(&mut self) {
        self.should_stop_thread.store(true, Ordering::SeqCst);
        self.disconnect_requested.store(true, Ordering::SeqCst);
        if let Some(handle) = self.worker_handle.lock().take() {
            let _ = handle.join();
        }
    }
}

fn connect_and_handshake(
    config: &BroadcastConfig,
    sample_rate: u32,
) -> Result<TcpStream, AudioError> {
    let mut stream = TcpStream::connect_timeout(
        &config
            .server
            .parse()
            .or_else(
                |_| match std::net::ToSocketAddrs::to_socket_addrs(&config.server) {
                    Ok(mut addrs) => addrs.next().ok_or(()),
                    Err(_) => Err(()),
                },
            )
            .map_err(|_| AudioError::Io("Alamat server streaming tidak valid".to_string()))?,
        Duration::from_secs(3),
    )
    .map_err(|e| AudioError::Io(format!("Gagal terhubung ke server streaming: {}", e)))?;

    stream
        .set_nodelay(true)
        .map_err(|e| AudioError::Io(e.to_string()))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(4)))
        .map_err(|e| AudioError::Io(e.to_string()))?;

    // Format autentikasi HTTP Basic Base64
    let auth_str = format!("source:{}", config.password);
    let auth_base64 = base64_encode(auth_str.as_bytes());

    let mount_point = if config.mount.starts_with('/') {
        config.mount.clone()
    } else {
        format!("/{}", config.mount)
    };

    let handshake = format!(
        "SOURCE {} HTTP/1.0\r\n\
        Authorization: Basic {}\r\n\
        User-Agent: DJDeX/0.11.0\r\n\
        ice-name: {}\r\n\
        ice-genre: {}\r\n\
        ice-description: {}\r\n\
        ice-bitrate: {}\r\n\
        ice-audio-info: channels=2;samplerate={};bitrate={}\r\n\
        ice-public: {}\r\n\
        Content-Type: audio/wav\r\n\
        \r\n",
        mount_point,
        auth_base64,
        config.station_name,
        config.genre,
        config.description,
        config.bitrate_kbps,
        sample_rate,
        config.bitrate_kbps,
        if config.is_public { 1 } else { 0 },
    );

    stream
        .write_all(handshake.as_bytes())
        .map_err(|e| AudioError::Io(format!("Gagal mengirim handshake: {}", e)))?;

    let mut response_buf = [0u8; 512];
    let n = stream
        .read(&mut response_buf)
        .map_err(|e| AudioError::Io(format!("Gagal menerima respon handshake: {}", e)))?;

    let response_str = String::from_utf8_lossy(&response_buf[..n]);
    if !response_str.contains("200") && !response_str.contains("OK") {
        return Err(AudioError::Io(format!(
            "Server menolak koneksi: {}",
            response_str.lines().next().unwrap_or("Unknown Error")
        )));
    }

    Ok(stream)
}

/// Fungsi bantu enkripsi standar Base64 murni tanpa dependensi eksternal.
pub fn base64_encode(input: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(input.len().div_ceil(3) * 4);

    for chunk in input.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;

        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARSET[(triple >> 18) & 0x3F] as char);
        result.push(CHARSET[(triple >> 12) & 0x3F] as char);

        if chunk.len() > 1 {
            result.push(CHARSET[(triple >> 6) & 0x3F] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARSET[triple & 0x3F] as char);
        } else {
            result.push('=');
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"source:hackme"), "c291cmNlOmhhY2ttZQ==");
    }

    #[test]
    fn test_broadcast_controller_init_status() {
        let (controller, mut producer) = BroadcastController::new(44100);
        let status = controller.status();
        assert!(!status.is_streaming);
        assert_eq!(status.bytes_sent, 0);

        // Producer push saat tidak streaming harus mengabaikan sampel
        producer.push(0.5, -0.5);
        assert!(!producer.is_active());
    }
}

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
    should_stop: Arc<AtomicBool>,
    bytes_sent: Arc<AtomicU64>,
    start_time: Arc<Mutex<Option<Instant>>>,
    last_error: Arc<Mutex<Option<String>>>,
    active_config: Arc<Mutex<Option<BroadcastConfig>>>,
    sample_rate: u32,
    worker_handle: Mutex<Option<JoinHandle<()>>>,
    consumer: Mutex<Option<Consumer<(f32, f32)>>>,
}

impl BroadcastController {
    pub fn new(sample_rate: u32) -> (Arc<Self>, BroadcastProducer) {
        let (producer, consumer) = RingBuffer::<(f32, f32)>::new(131_072);

        let is_streaming = Arc::new(AtomicBool::new(false));
        let should_stop = Arc::new(AtomicBool::new(false));
        let bytes_sent = Arc::new(AtomicU64::new(0));
        let start_time = Arc::new(Mutex::new(None));
        let last_error = Arc::new(Mutex::new(None));
        let active_config = Arc::new(Mutex::new(None));

        let controller = Arc::new(Self {
            is_streaming: Arc::clone(&is_streaming),
            should_stop: Arc::clone(&should_stop),
            bytes_sent: Arc::clone(&bytes_sent),
            start_time,
            last_error,
            active_config,
            sample_rate,
            worker_handle: Mutex::new(None),
            consumer: Mutex::new(Some(consumer)),
        });

        let rt_producer = BroadcastProducer {
            producer,
            is_streaming: Arc::clone(&is_streaming),
        };

        (controller, rt_producer)
    }

    /// Mulai siaran langsung ke server streaming yang ditentukan.
    pub fn start(&self, config: BroadcastConfig) -> Result<BroadcastStatus, AudioError> {
        if self.is_streaming.load(Ordering::SeqCst) {
            return Ok(self.status());
        }

        self.bytes_sent.store(0, Ordering::SeqCst);
        *self.start_time.lock() = Some(Instant::now());
        *self.last_error.lock() = None;
        *self.active_config.lock() = Some(config.clone());
        self.should_stop.store(false, Ordering::SeqCst);

        // Ambil consumer untuk worker thread
        let mut consumer_opt = self.consumer.lock();
        let consumer = consumer_opt.take().ok_or_else(|| {
            AudioError::BuildStream("Consumer broadcast ring buffer tidak tersedia".to_string())
        })?;

        let is_streaming = Arc::clone(&self.is_streaming);
        let should_stop = Arc::clone(&self.should_stop);
        let bytes_sent = Arc::clone(&self.bytes_sent);
        let last_error = Arc::clone(&self.last_error);
        let sample_rate = self.sample_rate;

        let handle = thread::Builder::new()
            .name("djdex-broadcast-client".to_string())
            .spawn(move || {
                let res = run_broadcast_worker(
                    config,
                    sample_rate,
                    consumer,
                    &is_streaming,
                    &should_stop,
                    &bytes_sent,
                );

                if let Err(e) = res {
                    *last_error.lock() = Some(e.to_string());
                }
                is_streaming.store(false, Ordering::SeqCst);
            })
            .map_err(|e| AudioError::BuildStream(format!("Gagal membuat thread broadcast: {}", e)))?;

        *self.worker_handle.lock() = Some(handle);
        self.is_streaming.store(true, Ordering::SeqCst);

        Ok(self.status())
    }

    /// Hentikan siaran langsung dan putuskan koneksi ke server.
    pub fn stop(&self) -> Result<BroadcastStatus, AudioError> {
        self.should_stop.store(true, Ordering::SeqCst);
        self.is_streaming.store(false, Ordering::SeqCst);

        if let Some(handle) = self.worker_handle.lock().take() {
            let _ = handle.join();
        }

        // Buat ulang ring buffer untuk sesi berikutnya
        let (producer, consumer) = RingBuffer::<(f32, f32)>::new(131_072);
        *self.consumer.lock() = Some(consumer);

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

fn run_broadcast_worker(
    config: BroadcastConfig,
    sample_rate: u32,
    mut consumer: Consumer<(f32, f32)>,
    is_streaming: &AtomicBool,
    should_stop: &AtomicBool,
    bytes_sent: &AtomicU64,
) -> Result<(), AudioError> {
    // Sambungkan ke server via TCP
    let mut stream = TcpStream::connect_timeout(
        &config
            .server
            .parse()
            .or_else(|_| match std::net::ToSocketAddrs::to_socket_addrs(&config.server) {
                Ok(mut addrs) => addrs.next().ok_or(()),
                Err(_) => Err(()),
            })
            .map_err(|_| AudioError::Io("Alamat server streaming tidak valid".to_string()))?,
        Duration::from_secs(5),
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

    // Kirim HTTP SOURCE handshake request
    let mount_point = if config.mount.starts_with('/') {
        config.mount.clone()
    } else {
        format!("/{}", config.mount)
    };

    let handshake = format!(
        "SOURCE {} HTTP/1.0\r\n\
        Authorization: Basic {}\r\n\
        User-Agent: DJDeX/0.10.0\r\n\
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

    // Baca respons handshake
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

    is_streaming.store(true, Ordering::SeqCst);

    // Buffer chunk audio PCM 16-bit stereo (misal 512 frame = 2048 byte)
    let mut chunk_buffer = Vec::with_capacity(2048);

    while !should_stop.load(Ordering::Relaxed) {
        chunk_buffer.clear();

        // Kumpulkan sampel dari consumer
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
            stream
                .write_all(&chunk_buffer)
                .map_err(|e| AudioError::Io(format!("Gagal streaming audio ke server: {}", e)))?;
            bytes_sent.fetch_add(chunk_buffer.len() as u64, Ordering::Relaxed);
        } else {
            thread::sleep(Duration::from_millis(10));
        }
    }

    Ok(())
}

/// Fungsi bantu enkripsi standar Base64 murni tanpa dependensi eksternal.
fn base64_encode(input: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((input.len() + 2) / 3 * 4);

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

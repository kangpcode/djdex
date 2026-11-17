//! Modul rekaman audio mix master: streaming lock-free dari jalur RT ke file WAV (16-bit, 24-bit, 32-bit Float).

use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use hound::{SampleFormat, WavSpec, WavWriter};
use parking_lot::Mutex;
use rtrb::{Consumer, Producer, RingBuffer};
use serde::{Deserialize, Serialize};

use crate::error::AudioError;

/// Format kualitas file rekaman audio WAV.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum RecordFormat {
    /// 16-bit Linear PCM (kualitas standar CD audio)
    #[default]
    Wav16,
    /// 24-bit Linear PCM (kualitas rekaman studio profesional)
    Wav24,
    /// 32-bit IEEE Floating Point (rentang dinamis tanpa distorsi clipping)
    Wav32Float,
}

/// Status terkini modul perekam master mix.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecorderStatus {
    pub is_recording: bool,
    pub is_paused: bool,
    pub file_path: Option<String>,
    pub format: RecordFormat,
    pub duration_secs: f64,
    pub bytes_written: u64,
    pub frames_recorded: u64,
    pub peak_l: f32,
    pub peak_r: f32,
    pub split_count: u32,
}

/// Produser ring buffer lock-free yang dipanggil langsung dari audio thread callback RT.
pub struct RecorderProducer {
    producer: Producer<(f32, f32)>,
    is_recording: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
}

impl RecorderProducer {
    /// Kirim satu frame stereo (L, R) ke buffer rekaman.
    /// Metode ini aman untuk thread real-time (lock-free, tanpa alokasi memori).
    #[inline]
    pub fn push(&mut self, left: f32, right: f32) {
        if self.is_recording.load(Ordering::Relaxed) && !self.is_paused.load(Ordering::Relaxed) {
            let _ = self.producer.push((left, right));
        }
    }

    #[inline]
    pub fn is_active(&self) -> bool {
        self.is_recording.load(Ordering::Relaxed)
    }
}

/// Pengendali sentral perekaman master audio mix.
pub struct RecorderController {
    is_recording: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    should_stop: Arc<AtomicBool>,
    should_split: Arc<AtomicBool>,
    frames_recorded: Arc<AtomicU64>,
    bytes_written: Arc<AtomicU64>,
    peak_l: Arc<AtomicU32>,
    peak_r: Arc<AtomicU32>,
    split_count: Arc<AtomicU32>,
    current_path: Arc<Mutex<Option<PathBuf>>>,
    current_format: Arc<Mutex<RecordFormat>>,
    sample_rate: u32,
    worker_handle: Mutex<Option<JoinHandle<()>>>,
}

impl RecorderController {
    /// Inisialisasi controller dan menghasilkan pasangan produser RT untuk engine audio.
    pub fn new(sample_rate: u32) -> (Arc<Self>, RecorderProducer) {
        // Alokasikan ring buffer 131.072 frame (~3 detik buffer stereo pada 44.1 kHz)
        let (producer, consumer) = RingBuffer::<(f32, f32)>::new(131_072);

        let is_recording = Arc::new(AtomicBool::new(false));
        let is_paused = Arc::new(AtomicBool::new(false));
        let should_stop = Arc::new(AtomicBool::new(false));
        let should_split = Arc::new(AtomicBool::new(false));
        let frames_recorded = Arc::new(AtomicU64::new(0));
        let bytes_written = Arc::new(AtomicU64::new(0));
        let peak_l = Arc::new(AtomicU32::new(0));
        let peak_r = Arc::new(AtomicU32::new(0));
        let split_count = Arc::new(AtomicU32::new(0));
        let current_path = Arc::new(Mutex::new(None));
        let current_format = Arc::new(Mutex::new(RecordFormat::default()));

        let controller = Arc::new(Self {
            is_recording: Arc::clone(&is_recording),
            is_paused: Arc::clone(&is_paused),
            should_stop: Arc::clone(&should_stop),
            should_split: Arc::clone(&should_split),
            frames_recorded: Arc::clone(&frames_recorded),
            bytes_written: Arc::clone(&bytes_written),
            peak_l: Arc::clone(&peak_l),
            peak_r: Arc::clone(&peak_r),
            split_count: Arc::clone(&split_count),
            current_path: Arc::clone(&current_path),
            current_format: Arc::clone(&current_format),
            sample_rate,
            worker_handle: Mutex::new(None),
        });

        let rt_producer = RecorderProducer {
            producer,
            is_recording: Arc::clone(&is_recording),
            is_paused: Arc::clone(&is_paused),
        };

        // Jalankan worker thread perekam di latar belakang
        controller.spawn_worker(consumer);

        (controller, rt_producer)
    }

    fn spawn_worker(&self, mut consumer: Consumer<(f32, f32)>) {
        let is_recording = Arc::clone(&self.is_recording);
        let _is_paused = Arc::clone(&self.is_paused);
        let should_stop = Arc::clone(&self.should_stop);
        let should_split = Arc::clone(&self.should_split);
        let frames_recorded = Arc::clone(&self.frames_recorded);
        let bytes_written = Arc::clone(&self.bytes_written);
        let peak_l = Arc::clone(&self.peak_l);
        let peak_r = Arc::clone(&self.peak_r);
        let split_count = Arc::clone(&self.split_count);
        let current_path = Arc::clone(&self.current_path);
        let current_format = Arc::clone(&self.current_format);
        let sample_rate = self.sample_rate;

        let handle = thread::Builder::new()
            .name("djdex-mix-recorder".to_string())
            .spawn(move || {
                let mut current_writer: Option<WavWriter<BufWriter<File>>> = None;
                let mut base_output_path: Option<PathBuf> = None;
                let mut active_format = RecordFormat::Wav16;
                let mut local_split_idx = 0u32;

                while !should_stop.load(Ordering::Relaxed) {
                    let recording = is_recording.load(Ordering::Relaxed);

                    // Periksa permintaan split file rekaman
                    if should_split.swap(false, Ordering::SeqCst) && current_writer.is_some() {
                        if let Some(writer) = current_writer.take() {
                            let _ = writer.finalize();
                        }
                        local_split_idx += 1;
                        split_count.store(local_split_idx, Ordering::Relaxed);

                        if let Some(base) = &base_output_path {
                            let next_path = make_split_path(base, local_split_idx);
                            *current_path.lock() = Some(next_path.clone());
                            if let Ok(w) = create_wav_writer(&next_path, sample_rate, active_format)
                            {
                                current_writer = Some(w);
                            }
                        }
                    }

                    if recording {
                        // Inisialisasi writer jika baru mulai
                        if current_writer.is_none() {
                            let guard_path = current_path.lock();
                            if let Some(ref path) = *guard_path {
                                base_output_path = Some(path.clone());
                                active_format = *current_format.lock();
                                local_split_idx = 0;
                                split_count.store(0, Ordering::Relaxed);
                                if let Ok(writer) =
                                    create_wav_writer(path, sample_rate, active_format)
                                {
                                    current_writer = Some(writer);
                                }
                            }
                        }

                        // Tulis sampel yang tersedia dari ring buffer ke file
                        let mut frames_this_batch = 0u64;
                        let mut max_l = 0.0f32;
                        let mut max_r = 0.0f32;

                        if let Some(ref mut writer) = current_writer {
                            while let Ok((l, r)) = consumer.pop() {
                                max_l = max_l.max(l.abs());
                                max_r = max_r.max(r.abs());

                                match active_format {
                                    RecordFormat::Wav16 => {
                                        let sl = (l.clamp(-1.0, 1.0) * 32767.0) as i16;
                                        let sr = (r.clamp(-1.0, 1.0) * 32767.0) as i16;
                                        let _ = writer.write_sample(sl);
                                        let _ = writer.write_sample(sr);
                                    }
                                    RecordFormat::Wav24 => {
                                        let sl = (l.clamp(-1.0, 1.0) * 8388607.0) as i32;
                                        let sr = (r.clamp(-1.0, 1.0) * 8388607.0) as i32;
                                        let _ = writer.write_sample(sl);
                                        let _ = writer.write_sample(sr);
                                    }
                                    RecordFormat::Wav32Float => {
                                        let _ = writer.write_sample(l);
                                        let _ = writer.write_sample(r);
                                    }
                                }
                                frames_this_batch += 1;
                            }

                            if frames_this_batch > 0 {
                                frames_recorded.fetch_add(frames_this_batch, Ordering::Relaxed);
                                let bytes_per_frame = match active_format {
                                    RecordFormat::Wav16 => 4,
                                    RecordFormat::Wav24 => 6,
                                    RecordFormat::Wav32Float => 8,
                                };
                                bytes_written.fetch_add(
                                    frames_this_batch * bytes_per_frame,
                                    Ordering::Relaxed,
                                );
                                peak_l.store(max_l.to_bits(), Ordering::Relaxed);
                                peak_r.store(max_r.to_bits(), Ordering::Relaxed);
                            }
                        }
                    } else if let Some(mut writer) = current_writer.take() {
                        // Selesai recording: flush sisa buffer dan tutup file
                        while let Ok((l, r)) = consumer.pop() {
                            match active_format {
                                RecordFormat::Wav16 => {
                                    let sl = (l.clamp(-1.0, 1.0) * 32767.0) as i16;
                                    let sr = (r.clamp(-1.0, 1.0) * 32767.0) as i16;
                                    let _ = writer.write_sample(sl);
                                    let _ = writer.write_sample(sr);
                                }
                                RecordFormat::Wav24 => {
                                    let sl = (l.clamp(-1.0, 1.0) * 8388607.0) as i32;
                                    let sr = (r.clamp(-1.0, 1.0) * 8388607.0) as i32;
                                    let _ = writer.write_sample(sl);
                                    let _ = writer.write_sample(sr);
                                }
                                RecordFormat::Wav32Float => {
                                    let _ = writer.write_sample(l);
                                    let _ = writer.write_sample(r);
                                }
                            }
                        }
                        let _ = writer.finalize();
                    }

                    // Tidur singkat agar thread tidak membebani CPU
                    thread::sleep(Duration::from_millis(15));
                }

                // Cleanup saat worker dihentikan
                if let Some(writer) = current_writer.take() {
                    let _ = writer.finalize();
                }
            })
            .expect("gagal membuat thread recorder");

        *self.worker_handle.lock() = Some(handle);
    }

    /// Mulai merekam master mix ke file tujuan dengan format yang ditentukan.
    pub fn start(
        &self,
        output_path: PathBuf,
        format: RecordFormat,
    ) -> Result<RecorderStatus, AudioError> {
        if self.is_recording.load(Ordering::SeqCst) {
            return Ok(self.status());
        }

        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AudioError::Io(format!("Gagal membuat direktori rekaman: {}", e)))?;
        }

        self.frames_recorded.store(0, Ordering::SeqCst);
        self.bytes_written.store(0, Ordering::SeqCst);
        self.split_count.store(0, Ordering::SeqCst);
        *self.current_path.lock() = Some(output_path);
        *self.current_format.lock() = format;
        self.is_paused.store(false, Ordering::SeqCst);
        self.is_recording.store(true, Ordering::SeqCst);

        Ok(self.status())
    }

    /// Hentikan perekaman dan selesaikan penulisan file WAV.
    pub fn stop(&self) -> Result<RecorderStatus, AudioError> {
        self.is_recording.store(false, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
        // Beri jeda singkat agar thread worker mem-flush sisa data dan memanggil finalize
        thread::sleep(Duration::from_millis(50));
        Ok(self.status())
    }

    /// Jeda perekaman sementara tanpa menutup file.
    pub fn pause(&self) -> RecorderStatus {
        if self.is_recording.load(Ordering::SeqCst) {
            self.is_paused.store(true, Ordering::SeqCst);
        }
        self.status()
    }

    /// Lanjutkan kembali perekaman yang sedang dijeda.
    pub fn resume(&self) -> RecorderStatus {
        if self.is_recording.load(Ordering::SeqCst) {
            self.is_paused.store(false, Ordering::SeqCst);
        }
        self.status()
    }

    /// Potong track saat ini dan mulai file baru secara mulus tanpa kehilangan sampel.
    pub fn split(&self) -> Result<RecorderStatus, AudioError> {
        if self.is_recording.load(Ordering::SeqCst) {
            self.should_split.store(true, Ordering::SeqCst);
        }
        Ok(self.status())
    }

    /// Ambil status perekaman saat ini (durasi, bytes, peak meter).
    pub fn status(&self) -> RecorderStatus {
        let is_rec = self.is_recording.load(Ordering::Relaxed);
        let is_pau = self.is_paused.load(Ordering::Relaxed);
        let frames = self.frames_recorded.load(Ordering::Relaxed);
        let bytes = self.bytes_written.load(Ordering::Relaxed);
        let splits = self.split_count.load(Ordering::Relaxed);
        let duration_secs = frames as f64 / self.sample_rate as f64;
        let p_l = f32::from_bits(self.peak_l.load(Ordering::Relaxed));
        let p_r = f32::from_bits(self.peak_r.load(Ordering::Relaxed));
        let file_path = self
            .current_path
            .lock()
            .as_ref()
            .map(|p| p.to_string_lossy().to_string());
        let format = *self.current_format.lock();

        RecorderStatus {
            is_recording: is_rec,
            is_paused: is_pau,
            file_path,
            format,
            duration_secs,
            bytes_written: bytes,
            frames_recorded: frames,
            peak_l: p_l,
            peak_r: p_r,
            split_count: splits,
        }
    }
}

impl Drop for RecorderController {
    fn drop(&mut self) {
        self.should_stop.store(true, Ordering::SeqCst);
        self.is_recording.store(false, Ordering::SeqCst);
        if let Some(handle) = self.worker_handle.lock().take() {
            let _ = handle.join();
        }
    }
}

fn create_wav_writer(
    path: &Path,
    sample_rate: u32,
    format: RecordFormat,
) -> Result<WavWriter<BufWriter<File>>, AudioError> {
    let spec = match format {
        RecordFormat::Wav16 => WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        },
        RecordFormat::Wav24 => WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 24,
            sample_format: SampleFormat::Int,
        },
        RecordFormat::Wav32Float => WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        },
    };

    WavWriter::create(path, spec)
        .map_err(|e| AudioError::Io(format!("Gagal membuat file WAV: {}", e)))
}

fn make_split_path(base_path: &Path, split_idx: u32) -> PathBuf {
    let stem = base_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("mix_recording");
    let ext = base_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("wav");
    let parent = base_path.parent().unwrap_or_else(|| Path::new(""));

    parent.join(format!("{}_part{:02}.{}", stem, split_idx + 1, ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recorder_workflow_wav16() {
        let dir = std::env::temp_dir().join(format!(
            "djdex_rec_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let file_path = dir.join("test_mix.wav");

        let (controller, mut producer) = RecorderController::new(44100);
        let status = controller.status();
        assert!(!status.is_recording);
        assert_eq!(status.frames_recorded, 0);

        let started = controller
            .start(file_path.clone(), RecordFormat::Wav16)
            .expect("start");
        assert!(started.is_recording);
        assert!(!started.is_paused);

        // Kirim 1000 frame audio
        for i in 0..1000 {
            let sample = (i as f32 / 1000.0) * 0.8;
            producer.push(sample, -sample);
        }

        thread::sleep(Duration::from_millis(60));

        let current = controller.status();
        assert!(current.frames_recorded > 0);
        assert!(current.bytes_written > 0);

        // Pause
        let paused = controller.pause();
        assert!(paused.is_paused);

        // Push saat pause tidak boleh menambah frame
        let frames_before = current.frames_recorded;
        for _ in 0..200 {
            producer.push(0.5, 0.5);
        }
        thread::sleep(Duration::from_millis(40));
        assert_eq!(controller.status().frames_recorded, frames_before);

        // Resume
        let resumed = controller.resume();
        assert!(!resumed.is_paused);

        // Stop
        let stopped = controller.stop().expect("stop");
        assert!(!stopped.is_recording);

        assert!(file_path.exists());
        let reader = hound::WavReader::open(&file_path).expect("open wav");
        assert_eq!(reader.spec().channels, 2);
        assert_eq!(reader.spec().sample_rate, 44100);
        assert_eq!(reader.spec().bits_per_sample, 16);
    }

    #[test]
    fn test_recorder_split() {
        let dir = std::env::temp_dir().join(format!(
            "djdex_split_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let file_path = dir.join("split_session.wav");

        let (controller, mut producer) = RecorderController::new(44100);
        controller
            .start(file_path.clone(), RecordFormat::Wav32Float)
            .expect("start");

        for _ in 0..500 {
            producer.push(0.3, -0.3);
        }
        thread::sleep(Duration::from_millis(50));

        controller.split().expect("split");
        thread::sleep(Duration::from_millis(50));

        for _ in 0..500 {
            producer.push(0.4, -0.4);
        }
        thread::sleep(Duration::from_millis(50));

        controller.stop().expect("stop");

        let part1 = dir.join("split_session.wav");
        let part2 = dir.join("split_session_part02.wav");

        assert!(part1.exists(), "part1 harus ada");
        assert!(part2.exists(), "part2 harus ada");

        let _ = std::fs::remove_dir_all(&dir);
    }
}

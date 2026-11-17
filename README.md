# DJDeX — By Kangpcode

[![CI Status](https://github.com/kangpcode/djdex/actions/workflows/ci.yml/badge.svg)](https://github.com/kangpcode/djdex/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-v0.12.0-cyan.svg)](https://github.com/kangpcode/djdex/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.88+-orange.svg)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-brightgreen.svg)](https://tauri.app/)

Software DJ virtual cross-platform profesional bertenaga **audio engine Rust real-time** dan UI desktop modern bergaya hardware klub. Menghadirkan dua deck fisik (A/B), mixer audio 4-channel, 3-slot FX chains, Auto DJ transisi beat-synced, Remixer Sampler 16-pad dengan 16-step drum machine sequencer, database SQLite library musik, integrasi kontroler MIDI dengan MIDI Learn interaktif, perekam audio master mix (WAV 16/24/32-bit Float), live streaming broadcast (Icecast 2 & SHOUTcast), serta sistem template/skin layout engine.

> **Status: 12 dari 12 Fase Selesai (v0.12.0 — Production Workstation Release).** Seluruh fitur terhubung penuh dari UI React ke audio engine Rust, 82 unit test lulus 100%, installer lintas platform siap didistribusikan (Windows MSI/NSIS, macOS Universal DMG, Linux DEB/RPM/AppImage/Flatpak), serta pipa CI/CD GitHub Actions aktif.

---

## Fitur Utama

### 1. Audio Engine & Deteksi Perangkat Real-Time
- **CPAL Audio I/O**: Kompatibel dengan WASAPI (Windows), CoreAudio (macOS), dan ALSA / PipeWire / PulseAudio (Linux).
- **Arsitektur Lock-Free**: Callback audio berjalan tanpa alokasi memori heap, tanpa blocking mutex lock, dan tanpa syscall disk I/O.
- **Latensi Ultra-Rendah**: Dukungan ukuran buffer fleksibel (64 hingga 1024 frames) dengan latensi output < 10 ms.
- **Deteksi Otomatis & Pemilihan Konfigurasi Tahan ALSA**: Menangani perangkat multi-channel tanpa crash channel map.
- **Diagnostik Lengkap**: Pemantauan visual realtime untuk sample rate, buffer size, estimasi latensi, microsecond callback timing, dan penghitung xrun.

### 2. Dual Deck (A & B) & Platter DJ Realistis
- **Decoder Audio Multi-Format Symphonia**: Memutar MP3, FLAC, WAV, OGG/Vorbis, AAC/M4A, AIFF, dan ALAC.
- **Time-Stretch & Master Tempo (Key Lock)**: Algoritma WSOLA mempertahankan nada vokal/musik secara jernih saat pitch tempo diubah (rentang fader ±8%, ±16%, atau ±50%).
- **Deteksi BPM & Kunci Harmonis Otomatis**: Analisis ketukan percussive onset + autokorelasi, deteksi kunci nada Camelot Wheel / Open Key untuk harmonic mixing.
- **Waveform Canvas Berfrekuensi Multi-Warna**: Gelombang suara dinamis dengan pemisahan warna frekuensi (Bass merah, Mid hijau, Treble biru), beatgrid vertikal, dan marker penanda.
- **Piringan Virtual Vinyl / CDJ Interaktif**: Animasi rotasi 60 FPS, kendali scratch mouse/touch responsif, mode vinyl scratch vs CDJ pitch bend, dan tekstur piringan dinamis.
- **Fitur Kinerja DJ**: 8 Hot Cue per deck, Auto Loop (1/32 hingga 32 ketukan), Loop Roll, Beat Jump, CUE sampler, dan Sync otomatis BPM + fase ketukan.

### 3. Mixer Audio & Filter
- **Channel Strip Lengkap**: Knob Gain/Trim individual, EQ 3-Band dengan Kill Switch per frekuensi (-∞ dB), dan resonance filter bi-directional satu kenop (HPF / LPF).
- **Crossfader Presisi**: Kurva dapat dipilih (Smooth Club Mixing, Constant Power, atau Sharp Scratch/Turntablist) dengan assign channel (A/B/Thru) dan tombol Reverse Hamster.
- **Master Bus Limiter**: Stereo-linked brickwall limiter anti-clipping dengan soft-clipper analog.
- **Sistem Monitoring Headphone Cueing**: Pre-Fade Listen (PFL) independen, Cue Mix, Cue Volume, dan Split Cue (L = Cue, R = Master) untuk kartu suara stereo 2-channel.

### 4. Rantai Efek (FX Chains) & Auto DJ
- **3 Slot FX per Deck & Master Bus**: Delay, Echo, Reverb, Flanger, Phaser, Chorus, Bitcrusher, Gater, Trans, Roll, Brake/Spinback, Filter Sweep, Noise, dan Wah.
- **Kontrol Parameter Parameter & Wet/Dry**: Penyesuaian waktu tunda sinkron ke birama BPM master.
- **Auto DJ Cerdas**: Transisi otomatis antar track dengan beat-matching otomatis dan crossfade mulus.

### 5. Remixer / Sampler & 16-Step Drum Sequencer
- **Sampler 16-Pad Berkecepatan Tinggi**: 32 voice polifonik, mode pemicu OneShot, Loop, Hold, Stutter, Drum Pad, dan Cue Point.
- **Kit Suara Bawaan & Kit Kustom**: Dilengkapi 4 soundbank bawaan (House, Techno, Hip-Hop, Scratch FX).
- **16-Step Drum Machine Sequencer**: Pengatur pola birama drum (Kick, Snare, Hi-Hat, Percussion) dengan kontrol swing dan switch pattern instan.
- **Sampling Langsung**: Tangkap potongan audio langsung dari deck yang sedang berputar ke dalam pad sampler.
- **Ekspor / Impor Paket Sample**: Dukungan berkas arsip `.zip` mandiri.

### 6. Perpustakaan Musik & Browser Cerdas
- **Penyimpanan SQLite Terintegrasi**: Mengindeks puluhan ribu koleksi musik dengan pencarian instan < 5 ms.
- **Manajemen Playlist & Crates**: Pengelompokan cerdas (*Smart Playlists* berdasarkan rentang BPM, genre, atau kunci nada harmonis).
- **Scanner Musik Latar Belakang**: Memindai folder secara rekursif, membaca tag ID3/Vorbis metadata via `lofty`, dan kalkulasi waveform cache.
- **Headphone Cue Preview Player**: Dengarkan cuplikan track di browser langsung melalui headphone tanpa mengganggu audio master panggung.
- **Dukungan M3U / M3U8 / PLS**: Impor dan ekspor daftar putar standar industri.

### 7. Integrasi Hardware MIDI Controller & Keyboard
- **Deteksi Plug-and-Play**: Terhubung langsung ke kontroler DJ USB MIDI fisik (Pioneer DJ, Numark, Native Instruments, Hercules, Denon, Reloop).
- **Decoding Jog Wheel Relatif**: Mendukung 4 mode putaran jog wheel (Relative Two's Complement, Binary Offset, Signed Bit, dan Absolute).
- **MIDI Learn Interaktif**: Klik kontrol UI, gerakkan knob/fader/tombol fisik, dan pemetaan langsung aktif.
- **Umpan Balik LED Dua Arah**: Lampu LED hardware menyala sesuai status cue, play, dan loop.
- **Pemetaan Keyboard Fleksibel**: Seluruh fungsi workstation dapat dimainkan penuh tanpa kontroler fisik.

### 8. Perekam Audio Master Mix & Live Streaming Broadcast
- **Master Mix Recorder (WAV)**: Streaming langsung sampel audio master ke disk via ring buffer lock-free tanpa membebani thread real-time.
- **Format Kualitas Studio**: Pilihan WAV 16-bit PCM (CD), 24-bit PCM (Studio), atau 32-bit IEEE Float (Anti-Clipping).
- **Fitur Split Track Instan**: Memotong track rekaman ke berkas part berikutnya (`_part02.wav`) secara mulus tanpa kehilangan satu sampel pun.
- **Live Streaming Broadcast**: Klien live streaming bawaan untuk server **Icecast 2** dan **SHOUTcast** dengan protokol HTTP `SOURCE`, autentikasi Base64, dan metadata siaran (nama stasiun, genre, deskripsi, bitrate 128–320 kbps).

### 9. Skin & Layout Engine
- **Pergantian Tema Real-Time**: Beralih tata letak dan tema visual seketika tanpa me-restart audio engine.
- **4 Template Pabrikan**:
  - **Classic Club**: Tata letak standar klub (2 deck CDJ + mixer tengah, waveform bertumpuk).
  - **Battle Scratch**: Piringan 12-inci besar vinyl, waveform vertikal terintegrasi, crossfader dominan, tombol scratch pads.
  - **Producer Remix**: Deck kompak dengan fokus penuh pada 16-Pad Sampler dan 16-Step Sequencer.
  - **Tour Pro**: Tata letak panggung tur festival profesional dengan waveform lebar dan palet cue 4 aksen.
- **Editor Visual & Format `.djdex-skin`**: Ekspor dan impor paket tema mandiri dalam format ZIP.

---

## Arsitektur Alur Sinyal Audio

```text
Dekoder Symphonia ──► Resampler ──► WSOLA Time-Stretch (Pitch/Key Lock) ──► Ring Buffer rtrb
                                                                                   │
┌──────────────────────────────────────────────────────────────────────────────────┘
▼
Callback Audio RT CPAL:
  Deck A FX ──► EQ 3-Band ──► Filter LPF/HPF ──► Channel Fader ──┐
                                                                 ├──► Crossfader ──► Master Mix Bus
  Deck B FX ──► EQ 3-Band ──► Filter LPF/HPF ──► Channel Fader ──┘          │
                                                                           ├─► Sampler & Synth
  (Headphone PFL Cue Bus)                                                  │
          │                                                                ▼
          ▼                                                         Master Limiter
    Split Cue / Ch 3-4                                                     │
                                                                           ├─► Recorder (WAV)
                                                                           ├─► Broadcast (Icecast)
                                                                           ▼
                                                                  Master Out (Ch 1-2)
```

---

## Mulai Cepat

### Prasyarat
- **Node.js**: Versi LTS (≥ 20.19.0)
- **Rust**: Versi stabil (≥ 1.88, edisi 2021)
- Dependensi sistem sesuai OS (lihat [`docs/BUILD_PER_OS.md`](docs/BUILD_PER_OS.md))

### Menjalankan Mode Pengembangan
```bash
# Pasang dependensi frontend
npm install

# Jalankan desktop workstation dengan engine audio aktif
npm run tauri dev
```

### Membangun Paket Distribusi Rilis
```bash
npm run tauri build
```

Paket installer installer akan otomatis dibuat di folder `src-tauri/target/release/bundle/`:
- **Windows**: `.msi` dan `.exe` (NSIS Setup)
- **macOS**: `.dmg` dan `.app` (Universal Binary)
- **Linux**: `.deb`, `.rpm`, `.AppImage`, dan Flatpak (`flatpak/com.kangpcode.djdex.yml`)

---

## Dokumentasi Teknis

- [Arsitektur Sistem & Spesifikasi Sinyal Audio](docs/ARSITEKTUR.md)
- [Panduan Kompilasi & Packaging per OS](docs/BUILD_PER_OS.md)
- [Spesifikasi Template & Skin Engine](docs/SKIN_SPEC.md)
- [Integrasi MIDI Controller & Keyboard Shortcuts](docs/MIDI_MAPPING.md)
- [Catatan Rilis & Changelog](CHANGELOG.md)

---

## Roadmap 12 Fase

| Fase | Deskripsi Modul | Status |
|:---:|---|:---:|
| **1** | Scaffold Tauri + React, IPC dasar, CPAL output tone test, deteksi perangkat audio | ✅ Selesai (v0.1.0) |
| **2** | Decoder (Symphonia) + deck tunggal: play/pause/seek/cue + waveform multi-frekuensi | ✅ Selesai (v0.2.0) |
| **3** | Time-stretch, pitch fader, key lock, sync, BPM/beatgrid/key detection | ✅ Selesai (v0.3.0) |
| **4** | Mixer: EQ 3-band + kill, filter HPF/LPF, fader, crossfader, master limiter, PFL cue | ✅ Selesai (v0.4.0) |
| **5** | Dua deck penuh + jog wheel platter + hot cue + loop + beat jump | ✅ Selesai (v0.5.0) |
| **6** | FX chain 3-slot (14 efek audio DSP) + Auto DJ transisi beat-synced | ✅ Selesai (v0.6.0) |
| **7** | Remixer / Sampler 16-pad + 16-step drum machine sequencer + live sample pack | ✅ Selesai (v0.7.0) |
| **8** | Library SQLite, scanner musik rekursif, playlist M3U, analisis batch | ✅ Selesai (v0.8.0) |
| **9** | MIDI Controller, MIDI Learn interaktif, relative jog decoding, keyboard mapping | ✅ Selesai (v0.9.0) |
| **10** | Skin & Layout Engine: 4 factory skins, visual theme editor, format `.djdex-skin` | ✅ Selesai (v0.10.0) |
| **11** | Modul rekaman mix master WAV lock-free + live streaming broadcast Icecast/SHOUTcast | ✅ Selesai (v0.11.0) |
| **12** | Packaging semua OS (MSI, NSIS, DMG, DEB, RPM, AppImage, Flatpak) + CI/CD + dokumentasi | ✅ Selesai (v0.12.0) |

---

## Pengujian & Kualitas Kode

- **82 Unit Tests di Rust**: Lulus 100% tanpa kegagalan (`cargo test`).
- **Jalur Audio Real-Time Murni**: Bebas dari alokasi memori heap, mutex lock, dan disk I/O.
- **Frontend Typecheck & Build**: Lulus `tsc -b` dan Vite production bundle tanpa kesalahan.

---

## Lisensi & Kredit

Hak Cipta (c) 2026 **Kangpcode**.
Didistribusikan di bawah lisensi resmi [MIT License](LICENSE).
Dikembangkan menggunakan Rust, Tauri 2, React, TypeScript, CPAL, dan Symphonia.

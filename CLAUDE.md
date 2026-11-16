PERAN
Kamu adalah Senior Systems Engineer dan Audio DSP Engineer yang ahli di Rust, Tauri 2.x, 
audio real-time, dan desain UI aplikasi DJ profesional. Kamu menulis kode produksi yang 
lengkap, bisa dikompilasi, terstruktur, dan didokumentasikan.

TUJUAN PROYEK
Bangun aplikasi desktop lintas platform bernama "DJDeX By Kangpcode": software Virtual DJ 
yang powerful dan lengkap, setara fitur inti VirtualDJ/Traktor/Serato, dengan dua deck 
(bisa diperluas ke 4 deck), mixer, remixer/sampler, efek, library musik, perekam, dukungan 
kontroler MIDI, dan sistem template/skin tampilan.

TECH STACK (WAJIB)
- Bahasa inti: Rust (stable terbaru, edition 2021+)
- Framework desktop: Tauri 2.x
- Frontend: React + TypeScript + Vite + Tailwind CSS (state: Zustand), 
  waveform/visualisasi via Canvas 2D atau WebGL (PixiJS/OffscreenCanvas)
- Audio I/O real-time: CPAL (WASAPI di Windows, CoreAudio di macOS, ALSA/PulseAudio/
  PipeWire/JACK di Linux). Opsional ASIO di Windows lewat feature flag.
- Decoding: Symphonia (MP3, FLAC, WAV, OGG/Vorbis, AAC/M4A, AIFF, Opus)
- Resampling: Rubato
- Time-stretch & pitch-shift (key lock / master tempo): Signalsmith Stretch atau 
  SoundTouch (bind via FFI), sediakan trait abstraksi agar bisa diganti
- FFT/analisis: RustFFT / realfft
- Lock-free komunikasi audio thread: rtrb atau ringbuf, crossbeam, atomic
- MIDI controller: midir (+ mapping yang bisa dikustomisasi)
- Database library: SQLite via rusqlite, tag metadata via lofty
- Rekaman: hound (WAV), opsional encoder FLAC/MP3
- Serialisasi: serde (JSON/TOML) untuk settings, template, mapping, preset

ATURAN AUDIO REAL-TIME (KRITIS)
- Audio callback thread TIDAK BOLEH: alokasi memori, lock (Mutex), I/O file, println, atau 
  panic. Semua komunikasi UI -> audio lewat command queue lock-free + parameter atomic.
- Decoding & analisis berjalan di thread terpisah (worker pool) dengan buffer ring.
- Target latensi output < 15 ms (buffer size dapat dipilih: 64/128/256/512/1024).
- Sample rate internal 44.1/48 kHz, float32, mixing stereo; dukung output multi-channel 
  untuk Master + Headphone Cue (split cue) pada dua perangkat/channel berbeda.
- Gunakan soft-clipper/limiter di master untuk mencegah clipping.

FITUR LENGKAP

1. DECK (minimal 2, opsi 4 deck)
- Load track via drag & drop atau dari library
- Play/Pause, Cue (CUE default, Cue Sampler preview), Sync, Master Sync, Stop, Reverse/Slip
- Pitch/tempo fader (±8%, ±16%, ±50% dapat dipilih), pitch bend (+/-), Key Lock (Master Tempo)
- Keyshift/transpose semitone
- Jog wheel / piringan virtual (platter): scratch dengan mouse/touch/trackpad, 
  mode Vinyl (scratch) dan CDJ (pitch bend), animasi rotasi sesuai posisi, 
  indikator posisi (cincin progress), tampilan label piringan bisa diganti
- Waveform: overview + scrolling zoomable waveform berwarna per frekuensi (low/mid/high), 
  beatgrid, marker cue, loop region, playhead
- BPM & beat detection otomatis, beatgrid editor (geser, tap tempo, double/half BPM), 
  key detection (Camelot wheel / Open Key)
- 8 Hot Cue per deck (set, trigger, hapus, warna, label), memory cue
- Loop: auto loop (1/32 sampai 32 beat), manual loop in/out, loop roll, loop move, 
  halve/double
- Beat jump (1/4 sampai 64 beat)
- Slicer / beat looper opsional
- Stem separation (opsional fase lanjut, via ONNX Runtime + model Demucs/Spleeter): 
  vocal, drums, bass, other dengan fader per stem
- Tampilan: judul, artis, BPM, key, waktu elapsed/remaining, pitch %, VU meter, 
  indikator sync/master/loop/key lock

2. MIXER
- Channel strip per deck: Gain/Trim, EQ 3-band (High/Mid/Low) atau 4-band dengan kill 
  switch, Filter (HPF/LPF satu knob), channel fader, VU meter pre/post, tombol PFL/Cue
- Crossfader dengan kurva dapat dipilih (smooth, sharp/scratch, constant power), 
  assign A/B/Thru per channel, reverse crossfader
- Master: volume, balance, limiter, VU meter L/R, booth output
- Headphone: Cue volume, Cue Mix (cue/master), split cue
- Auto-mix / Auto DJ: transisi otomatis antar track dengan panjang crossfade 
  dan mode beat-match

3. EFEK (per deck dan master, rantai 3 slot)
- Echo/Delay, Reverb, Flanger, Phaser, Chorus, Bitcrusher, Gater, Trans, Roll, 
  Brake/Spinback, Filter sweep, Noise, Wah
- Parameter: Wet/Dry, Param 1-3, BPM-synced time, enable per slot
- Implementasi DSP sendiri di Rust (biquad, delay line, all-pass reverb, LFO)
- Preset efek dan Macro FX

4. REMIXER / SAMPLER
- Remixer panel dengan 8-16 sample pad per bank, banyak bank
- Pad modes: One-shot, Loop, Hold, Stutter, Drum pad, Cue pad
- Sample slot bisa diisi dari file, dari potongan deck, atau rekaman langsung
- Quantize ke beat grid, volume per pad, pitch per pad, mute group
- Sample player dengan sync ke BPM master
- Step Sequencer 16-step (drum machine mini) dengan swing dan pattern bank
- Remix Pads dengan warna, label, dan bank kit (Hip-Hop, EDM, House, dll.)
- Scratch sample / DJ Scratch pads
- Export/impor sample pack (.zip + manifest JSON)

5. LIBRARY & BROWSER
- Scan folder musik, database SQLite, pencarian cepat, sorting kolom (judul, artis, BPM, 
  key, genre, rating, durasi, tanggal tambah)
- Playlist, Crate, Smart Playlist (filter BPM/key/genre), history
- Analisis batch di background (BPM, key, waveform cache, ReplayGain/loudness)
- Preview player di browser (headphone cue)
- Dukungan impor playlist M3U/PLS

6. REKAMAN & BROADCAST
- Record mix master ke WAV/FLAC, indikator timer dan level
- Opsional: Live streaming (Icecast/Shoutcast) fase lanjut

7. KONTROLER MIDI/HID
- Deteksi otomatis perangkat MIDI, MIDI Learn (klik kontrol di UI lalu gerakkan 
  kenop fisik), mapping disimpan sebagai preset JSON
- Dukung LED feedback dan jog wheel relatif
- Keyboard shortcut yang bisa dikustomisasi

8. SISTEM TEMPLATE / SKIN "MESIN TAMPILAN DJ VIRTUAL"
- Aplikasi punya rendering engine layout berbasis JSON/TOML (template manifest) yang 
  mendefinisikan: posisi dan ukuran komponen (deck, platter, waveform, mixer, 
  remixer, browser, efek), warna, font, gambar latar, asset SVG/PNG, animasi
- Template bawaan minimal 4:
  a) "Classic Club" (2 deck + mixer tengah, gaya CDJ + DJM)
  b) "Battle Scratch" (platter besar, crossfader fokus, pad scratch)
  c) "Producer Remix" (deck kecil, remixer/sampler dan sequencer besar)
  d) "Four-Deck Pro" (4 deck, waveform bertumpuk)
- Hot-swap template tanpa restart, import/export template (.djdex-skin = zip), 
  editor tema sederhana (warna aksen, mode gelap/terang, ukuran komponen)
- Skema komponen reusable: <Deck/>, <Platter/>, <Waveform/>, <Mixer/>, <ChannelStrip/>, 
  <Crossfader/>, <FxUnit/>, <PadGrid/>, <Sequencer/>, <Browser/>, <VuMeter/>, <Knob/>, 
  <Fader/>
- Kenop (knob) dan fader mendukung drag, scroll, double-click reset, 
  nilai fine saat tahan Shift

DESAIN UI/UX
- Tema gelap bergaya hardware DJ profesional (aksen neon cyan/magenta), 
  piringan vinyl/CDJ realistis dengan animasi 60 FPS
- Layout utama: Header (logo DJDeX, master VU, rekam, pengaturan, template) 
  -> Waveform bertumpuk -> Deck kiri | Mixer tengah | Deck kanan 
  -> Panel bawah (Remixer/Sampler, FX, Sequencer, Library) dengan tab
- Responsif untuk jendela 1280x720 sampai 4K, mode layar penuh, dukungan layar sentuh
- Aksesibilitas: kontras tinggi, tooltip untuk setiap kontrol, shortcut terlihat
- Branding: nama "DJDeX", subteks "By Kangpcode", logo vektor + ikon aplikasi 
  (ico/icns/png) untuk semua platform

PLATFORM & PACKAGING (WAJIB SEMUA)
- Windows 10/11 (x64, arm64 opsional): installer .msi dan NSIS .exe
- macOS (Intel + Apple Silicon, universal binary): .app dan .dmg, entitlements untuk 
  akses mikrofon/audio, instruksi code-signing dan notarization
- Linux: .deb (Ubuntu/Debian), .rpm (Fedora/RHEL/openSUSE), AppImage, dan manifest 
  Flatpak; dokumentasikan dependensi (libasound2-dev, libwebkit2gtk-4.1-dev, 
  libjack/pipewire, dll.)
- GitHub Actions CI/CD: matrix build windows-latest, macos-latest, ubuntu-22.04 
  (dan runner Fedora via container), auto-release artefak per tag
- Auto-update memakai tauri-plugin-updater

STRUKTUR PROYEK YANG DIHARAPKAN
djdex/
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs, lib.rs, commands.rs, state.rs
│  │  ├─ audio/ (engine.rs, device.rs, mixer.rs, deck.rs, resampler.rs, 
│  │  │          timestretch.rs, limiter.rs, recorder.rs, cue_bus.rs)
│  │  ├─ dsp/ (eq.rs, filter.rs, fx/*.rs, loudness.rs)
│  │  ├─ analysis/ (bpm.rs, beatgrid.rs, key.rs, waveform.rs)
│  │  ├─ sampler/ (pad.rs, bank.rs, sequencer.rs)
│  │  ├─ library/ (db.rs, scanner.rs, playlist.rs)
│  │  ├─ midi/ (device.rs, mapping.rs)
│  │  └─ skin/ (manifest.rs, loader.rs)
│  ├─ Cargo.toml, tauri.conf.json, capabilities/
├─ src/ (React: components/, stores/, skins/, hooks/, lib/ipc.ts)
├─ skins/ (classic-club, battle-scratch, producer-remix, four-deck-pro)
├─ docs/ (ARSITEKTUR.md, SKIN_SPEC.md, MIDI_MAPPING.md, BUILD_PER_OS.md)
└─ .github/workflows/

DELIVERABLE
1. Arsitektur lengkap (diagram teks alur audio: Decode -> Stretch -> EQ -> FX -> 
   Channel -> Crossfader -> Master -> Limiter -> Output, plus Cue bus) 
2. Seluruh kode sumber Rust + frontend, siap build
3. Cargo.toml dengan versi crate eksplisit dan feature flag per OS
4. Spesifikasi format template/skin beserta 4 template contoh
5. Panduan build, run, dan packaging untuk Windows, macOS, Ubuntu/Debian, Fedora
6. Unit test untuk DSP, beat detection, dan parser skin; benchmark latensi
7. README.md profesional, CHANGELOG, dan lisensi (periksa kompatibilitas lisensi 
   SoundTouch/dependensi lain)

KRITERIA KUALITAS
- Tanpa glitch/xrun pada beban 4 deck + efek; CPU idle < 5%, saat 2 deck + FX < 20%
- Tidak ada panic di audio thread; error handling dengan thiserror/anyhow
- Kode modular, clippy bersih, rustfmt, komentar jelas (bahasa Indonesia untuk docs, 
  Inggris untuk identifier)
- Semua fitur di atas benar-benar terhubung dari UI ke engine (bukan mock)

CARA KERJA
Kerjakan bertahap per fase dan JANGAN melewatkan bagian. Setiap fase harus bisa 
dikompilasi dan dijalankan sebelum lanjut. Di akhir tiap fase, tampilkan: file yang 
dibuat, cara menjalankan, dan apa yang akan dikerjakan di fase berikutnya.

FASE:
 1. Scaffold Tauri + React, IPC dasar, CPAL output tone test, deteksi perangkat audio
 2. Decoder (Symphonia) + deck tunggal: play/pause/seek/cue + waveform
 3. Time-stretch, pitch fader, key lock, sync, BPM/beatgrid/key detection
 4. Mixer: EQ, filter, fader, crossfader, master limiter, PFL/cue headphone
 5. Dua deck penuh + jog wheel/platter + hot cue + loop + beat jump
 6. Efek (FX chain) dan Auto DJ
 7. Remixer/Sampler + Step Sequencer
 8. Library, database, analisis batch, playlist
 9. MIDI Learn + keyboard mapping
10. Sistem template/skin + 4 template bawaan + editor tema
11. Rekaman, pengaturan audio, polish UI, optimasi performa
12. Packaging semua OS + CI/CD + dokumentasi

Mulai sekarang dengan FASE 1. Sebelum menulis kode, berikan ringkasan arsitektur 
dan daftar dependensi final.
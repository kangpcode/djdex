# DJDeX — By Kangpcode

Software DJ virtual cross-platform dengan audio engine **Rust real-time** dan UI
desktop bergaya hardware profesional. Target akhirnya setara fitur inti
VirtualDJ/Traktor/Serato: dua deck (bisa empat), mixer, efek, remixer/sampler,
library, rekaman, kontroler MIDI, dan sistem template/skin.

> **Status: Fase 4 selesai.** Shell Tauri + React, deteksi perangkat, test tone,
> **decoder Symphonia**, **Deck A dengan play/pause/seek/cue**, **waveform +
> beatgrid interaktif**, **pitch fader/key lock/keyshift**, **deteksi BPM/key**,
> dan **mixer channel strip (EQ/filter/fader/crossfader) + limiter master + cue
> bus** sudah berfungsi nyata ke engine Rust. FX dan library menyusul.

## Tampilan & alur kerja

- Header dengan status stream (sample rate, channel, format, buffer, latensi).
- **Deck A**: waveform overview dengan playhead, marker cue, garis beatgrid,
  drag-to-seek, tombol CUE/PLAY/SET CUE, seek ±10 s, gain fader, meter, info
  codec/buffer/underrun.
- **Tempo & key**: pitch fader dengan rentang 8/16/50 %, key lock (WSOLA),
  keyshift semitone, BPM efektif, tap tempo, ×2/÷2, key Camelot/Open Key, dan
  waktu beat pertama.
- **Mixer**: channel A dengan EQ 3-band + kill, filter satu knob, channel fader,
  PFL, crossfader (kurva smooth/constant-power/sharp, assign A/B/Thru, reverse),
  master volume/balance, limiter stereo-linked, dan headphone cue (volume, cue
  mix, split cue).
- **Audio Output**: pilih device, buffer 64–1024 frame, sample rate, lalu
  nyalakan engine.
- **Test Tone**: generator sine diagnostik (opsional) dengan meter dan
  statistik callback RT.

## Stack

| Lapisan | Teknologi |
| --- | --- |
| Audio I/O | CPAL 0.18 (WASAPI, CoreAudio, ALSA/PipeWire/PulseAudio, JACK) |
| Decoding | Symphonia 0.5 (MP3, FLAC, WAV, OGG/Vorbis, AAC/M4A, AIFF, ALAC) |
| Resampling | cubic Catmull-Rom internal + WSOLA time-stretch/key lock |
| Analisis | BPM (onset + autokorelasi), key Krumhansl/Camelot (RustFFT) |
| Mixer DSP | biquad RBJ, EQ 3-band, filter DJ, crossfader, limiter stereo-linked |
| Engine inti | Rust 2021+, callback RT-safe, atomic + ring buffer `rtrb` |
| Desktop shell | Tauri 2 + plugin dialog native |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand |
| IPC | Tauri commands typed + serde DTO (camelCase) |

## Mulai cepat

Prasyarat minimum: **Rust stable**, **Node.js ≥ 20.19**, dan dependensi sistem
sesuai OS (lihat [`docs/BUILD_PER_OS.md`](docs/BUILD_PER_OS.md)).

```bash
npm install
npm run tauri dev
```

Build produksi lokal:

```bash
npm run tauri build
```

### Skrip

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Vite dev server (UI saja, tanpa IPC Tauri) |
| `npm run tauri dev` | Aplikasi desktop + engine audio |
| `npm run build` | Typecheck TypeScript + bundle frontend |
| `npm run tauri build` | Paket installer (lihat `docs/BUILD_PER_OS.md`) |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Unit test Rust (DSP, decoder, waveform, deck) |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Lint Rust |

## Cara memakai

1. Jalankan `npm run tauri dev`.
2. Di panel **Audio Output**, pilih perangkat dan buffer, lalu tekan
   **Nyalakan audio engine**.
3. Muat track dengan **Muat track** (dialog native) atau drag & drop file audio
   ke jendela aplikasi. Format: MP3, FLAC, WAV, OGG, AAC/M4A, AIFF, ALAC.
4. Tekan **PLAY** (atau Space) untuk mulai. Waveform akan muncul setelah
   analisis singkat; klik/drag waveform untuk seek.
5. **SET CUE** menyimpan posisi saat ini sebagai cue; **CUE** kembali ke cue &
   pause (saat playing) atau mulai play (saat sudah di cue).
6. Geser **Pitch fader**; aktifkan **KEY LOCK** agar tempo berubah tanpa nada,
   lalu pakai **−/+** untuk transpose semitone.
7. Setelah analisis selesai, **BPM**, **key Camelot**, dan **beatgrid** muncul.
   **TAP** beberapa kali mengikuti beat untuk mengoreksi BPM; **÷2/×2** untuk
   mengubah kerapatan grid.
8. Di panel **Mixer**, atur EQ/filter/fader channel A, crossfader, master, dan
   cue. Untuk headphone: gunakan device ≥4 channel (cue di output 3/4) atau
   aktifkan **SPLIT CUE** pada output stereo (L = cue, R = master), lalu tekan
   **PFL**.

> Test tone ikut melewati master volume + limiter, tetapi tidak melewati EQ
> channel. Key lock memakai WSOLA internal; perubahan tempo/keylock baru
> terdengar setelah prebuffer ±0,3 detik habis. Cue headphone membutuhkan device
> ≥4 channel atau mode split cue; stream headphone terpisah belum dibuka. Sync
> antar-deck menunggu Deck B pada Fase 5.

## Struktur proyek

```
djdex/
├─ src/                          # React: components, stores, lib/ipc, styles
│  ├─ components/DeckPanel.tsx   # Deck A + transport + waveform
│  ├─ components/MixerPanel.tsx  # channel strip, crossfader, master, cue
│  ├─ components/Waveform.tsx    # Canvas 2D + beatgrid, drag-to-seek
│  └─ stores/{audioStore,deckStore,mixerStore}.ts
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs, lib.rs, commands.rs, state.rs, error.rs
│  │  ├─ audio/
│  │  │  ├─ engine.rs            # RT callback, mixing, stream lifecycle
│  │  │  ├─ decoder.rs           # Symphonia streaming + seek
│  │  │  ├─ deck.rs              # worker, ring, transport epoch, tempo/keylock
│  │  │  ├─ resampler.rs         # cubic resampler stereo + set_speed
│  │  │  ├─ timestretch.rs       # WSOLA + trait TimeStretcher
│  │  │  ├─ mixer.rs             # EQ/filter/fader/crossfader/cue + kontrol
│  │  │  ├─ limiter.rs           # limiter master
│  │  │  ├─ gain.rs, device.rs
│  │  ├─ dsp/
│  │  │  ├─ biquad.rs            # RBJ biquad
│  │  │  ├─ eq.rs                # EQ 3-band + kill
│  │  │  └─ filter.rs            # filter satu knob
│  │  ├─ analysis/
│  │  │  ├─ waveform.rs          # min/max buckets + cancellation
│  │  │  ├─ bpm.rs               # BPM + beat pertama
│  │  │  ├─ key.rs               # chroma FFT + Camelot
│  │  │  └─ track.rs             # orkestrasi analisis
│  ├─ icons/, capabilities/, Cargo.toml, tauri.conf.json
├─ docs/ARSITEKTUR.md            # alur sinyal, thread model, dependensi
├─ docs/BUILD_PER_OS.md          # prasyarat & packaging per OS
├─ CHANGELOG.md, LICENSE
```

## Arsitektur singkat

```
UI React ──invoke──► Tauri command ──► AudioEngine (atomic + channel)
                                          │                 deck worker: Symphonia → resample → WSOLA → rtrb ring
                                          │
                        audio host thread (pemilik cpal::Stream)
                                          │
                 callback CPAL: gain → EQ → filter → fader → crossfader
                                → master volume → limiter → output
                                          │
                               WASAPI / CoreAudio / ALSA
```

Callback audio membaca ring buffer tanpa alokasi atau lock; posisi dihitung dari
frame yang benar-benar dikonsumsi. Seek/load memakai **epoch handshake**: worker
menaikkan epoch, callback membuang buffer lama lalu meng-ack, baru worker mengisi
data baru. Detail lengkap ada di [`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md).

## Roadmap

| Fase | Fokus | Status |
| --- | --- | --- |
| 1 | Scaffold Tauri, IPC, CPAL, deteksi device, test tone | ✅ |
| 2 | Decoder Symphonia + satu deck + waveform | ✅ |
| 3 | Time-stretch, pitch, key lock, BPM/key detection | ✅ |
| 4 | Mixer: EQ, filter, fader, crossfader, limiter, cue | ✅ |
| 5 | Dua deck penuh: platter, hot cue, loop, beat jump | ⏳ berikutnya |
| 6 | FX chain + Auto DJ | ⏳ |
| 7 | Remixer/sampler + step sequencer | ⏳ |
| 8 | Library SQLite, scan, playlist, analisis batch | ⏳ |
| 9 | MIDI Learn + keyboard mapping | ⏳ |
| 10 | Skin engine + 4 template + editor tema | ⏳ |
| 11 | Rekaman, audio settings, polish, optimasi | ⏳ |
| 12 | Packaging semua OS + CI/CD + dokumentasi final | ⏳ |

## Kualitas

- `#![forbid(unsafe_code)]` di crate aplikasi; tidak ada `unwrap()`/panic di
  jalur audio.
- 47 unit test Rust: konversi dB, soft clip, oscillator, render block, decoder
  WAV, resampler, WSOLA (durasi & pitch), waveform, transport deck, BPM click
  track, key Camelot, speed clamp, biquad/EQ/filter, limiter (peak & pemulihan),
  kurva crossfader, cue PFL, dan clamp parameter mixer.
- `cargo fmt` + `cargo clippy -D warnings` bersih.
- Target performa: latensi output < 15 ms, tanpa xrun pada 4 deck + FX,
  CPU idle < 5 % (diverifikasi bertahap pada fase DSP).

## Lisensi

MIT — lihat [`LICENSE`](LICENSE). Catatan lisensi dependensi (termasuk Symphonia
MPL-2.0 dan opsi SoundTouch LGPL-2.1) ada di `docs/ARSITEKTUR.md` bagian 9.

Kredit: **Kangpcode** · dibangun dengan Rust, Tauri, CPAL, dan Symphonia.

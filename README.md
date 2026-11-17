# DJDeX — By Kangpcode

Software DJ virtual cross-platform dengan **audio engine Rust real-time** dan UI
desktop bergaya hardware profesional. Dua deck fisik (A/B), mixer, efek, remixer
sampler, library SQLite, kontroler MIDI, rekaman mix, live broadcast, dan sistem
template/skin yang benar-benar mengubah tampilan aplikasi.

> **Status: Fase 11 selesai (v0.11.0).** Dari 12 fase, 11 sudah berfungsi dan
> terhubung dari UI ke engine Rust: audio I/O, dua deck, mixer, FX + Auto DJ,
> sampler/sequencer, library, MIDI, skin engine, rekaman, dan broadcast.
> Fase 12 (packaging semua OS + CI/CD) adalah pekerjaan berikutnya.

## Kemampuan saat ini

### Audio engine & perangkat
- CPAL untuk WASAPI, CoreAudio, dan ALSA (PipeWire/PulseAudio via ALSA).
- **Engine otomatis menyala saat aplikasi dibuka** dengan perangkat default.
- Pemilihan perangkat, buffer 64–1024 frame (di-clamp ke rentang driver), sample
  rate, dan **jumlah channel** (stereo atau 4 channel master + cue).
- **Pemilihan konfigurasi tahan ALSA**: hanya channel count yang diekspos driver
  yang diminta, kandidat dicoba berurutan (pilihan pengguna → stereo → default
  perangkat), sehingga error `find_matching_chmap` tidak lagi menggagalkan
  inisialisasi.
- Status stream lengkap: format, channel, buffer, latensi, waktu callback,
  peak master L/R, reduksi limiter, dan penghitung xrun.

### Deck (A/B)
- Decoder Symphonia: MP3, FLAC, WAV, OGG/Vorbis, AAC/M4A, AIFF, ALAC.
- Resampler Catmull-Rom stereo, WSOLA time-stretch, key lock, pitch fader
  ±8/16/50 %, keyshift semitone.
- Play/pause/cue CDJ, seek ±10 detik, gain, meter, drag & drop, deteksi BPM dan
  key Camelot/Open Key, beatgrid, tap tempo, ×2/÷2.
- 8 hot cue per deck (warna mengikuti palet skin), loop 1/32–32 beat, manual
  loop in/out, loop roll, halve/double, beat jump, sync BPM + fase.
- Platter vinyl/CDJ interaktif dengan ukuran, tekstur, dan warna aksen per skin.

### Mixer
- Channel strip per deck: gain, EQ 3-band + kill, filter satu knob, fader, PFL.
- Crossfader dengan kurva smooth/constant-power/sharp, assign A/B/Thru, reverse.
- Master volume/balance, limiter stereo-linked, cue bus, cue volume/mix, split cue.
- Routing headphone ke output 3/4 pada perangkat ≥4 channel, atau split cue L/R.

### Efek & Auto DJ
- Rantai 3 slot untuk Deck A, Deck B, dan Master: delay, echo, reverb, flanger,
  phaser, chorus, bitcrusher, gater, trans, roll, brake, filter sweep, noise, wah.
- Auto DJ: beatmatch + sinkron fase, crossfade berbasis ketukan, transisi manual,
  dan pembatalan yang mengembalikan crossfader.

### Remixer / Sampler & Sequencer
- 32 voice, 16 pad, 4 bank kit bawaan, mode OneShot/Loop/Hold/Stutter/Drum/Cue.
- Pitch per pad, mute group, sync tempo, capture potongan deck ke pad.
- Step sequencer 16 langkah (kick/snare/hihat/perc), swing, 4 pattern.
- Impor file audio ke pad, ekspor/impor sample pack `.zip`.

### Library & browser
- Database SQLite dengan track, crate, playlist, smart playlist, rating, warna,
  play count, dan riwayat pemutaran.
- Pemindaian folder rekursif + tag `lofty`, analisis batch BPM/key/loudness.
- Preview headphone cue tanpa bocor ke master, impor/ekspor M3U/M3U8/PLS.

### Rekaman & live broadcast
- Rekaman master mix ke WAV 16-bit, 24-bit, atau 32-bit float; pause/resume,
  split file tanpa kehilangan sampel, VU meter, dan lokasi file.
- Live streaming Icecast2/SHOUTcast dengan bitrate, nama stasiun, genre, dan
  status ON AIR.

### MIDI & keyboard
- Deteksi port MIDI in/out, MIDI Learn interaktif, jog wheel relatif (4 mode),
  LED feedback dua arah, preset DDJ-400/FLX4, Hercules, dan generik.
- Pemetaan keyboard lengkap untuk deck, hot cue, loop, browser, dan sampler.

### Skin & Layout Engine
Manifest JSON/TOML (id, metadata, tema, layout) diterapkan **real-time tanpa
restart**. Tema mengubah token inti aplikasi (latar, panel, border, teks, aksen,
font), bukan hanya variabel yang tidak terpakai. Layout mengubah:

- aksen per deck dan palet hot cue;
- ukuran, tekstur vinyl, dan center display platter;
- posisi, orientasi (horizontal/vertikal), tinggi, dan beatgrid waveform;
- tampilan scratch pads;
- posisi mixer (tengah atau compact-bottom);
- panel bawah awal dan phase sync strip.

Empat template pabrikan:

| Skin | Karakter |
| --- | --- |
| **Classic Club** | Standar club: mixer tengah, waveform horizontal 110 px, platter standard, aksen cyan/magenta, panel Library. |
| **Battle Scratch** | Turntablist: platter 190 px, waveform **vertikal** 240 px, scratch pads aktif, phase strip disembunyikan, aksen gold/crimson, panel Sampler. |
| **Producer Remix** | Live remixer: platter compact, waveform 80 px, mixer **compact-bottom**, scratch pads aktif, aksen purple/pink, panel Sampler. |
| **Tour Pro** | Tur/festival: waveform lebar 164 px, platter standard tanpa center display, palet 4 aksen untuk cue bank, phase strip aktif, panel Library. |

Ekspor paket `.djdex-skin` (zip berisi `skin.json` + `skin.toml`), impor dengan
validasi manifest, editor warna/layout, dan galeri template ada di panel
**Skins & Layout**.

## Stack

| Lapisan | Teknologi |
| --- | --- |
| Audio I/O | CPAL 0.18 (WASAPI, CoreAudio, ALSA/PipeWire/PulseAudio, JACK) |
| Decoding | Symphonia 0.5 (MP3, FLAC, WAV, OGG/Vorbis, AAC/M4A, AIFF, ALAC) |
| DSP | Resampler cubic, WSOLA, biquad RBJ, EQ 3-band, filter DJ, FX, limiter |
| Analisis | BPM onset + autokorelasi, key Krumhansl/Camelot (RustFFT), waveform |
| Library | SQLite (`rusqlite` bundled) + tag `lofty` |
| MIDI | `midir` (input, output, LED feedback) |
| Rekaman | `hound` (WAV PCM 16/24/32 float) + broadcast TCP Icecast2/SHOUTcast |
| Skin | `serde` JSON/TOML + `zip` untuk paket `.djdex-skin` |
| Desktop | Tauri 2 + plugin dialog native |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4 + Zustand |
| IPC | Tauri command typed + serde DTO (camelCase) |

## Mulai cepat

Prasyarat: **Rust stable**, **Node.js ≥ 20.19**, dan dependensi sistem sesuai OS
(lihat [`docs/BUILD_PER_OS.md`](docs/BUILD_PER_OS.md)).

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
| `cargo test --manifest-path src-tauri/Cargo.toml` | Unit test Rust |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | Lint Rust |

## Cara memakai

1. Jalankan `npm run tauri dev`. Engine audio dan semua subsistem (library,
   MIDI, skin, sampler, recorder) diinisialisasi otomatis.
2. Buka **Audio Output & Diagnostics** untuk memeriksa perangkat, channel,
   buffer, dan latensi. Jika perlu, pilih perangkat/channel lalu
   **Terapkan ulang konfigurasi**.
3. Muat track ke deck dengan **Muat track**, drag & drop, atau dari Library.
4. Tekan **PLAY** / Space. Klik atau drag waveform untuk seek.
5. Gunakan **SET CUE**, **CUE**, pitch fader, **KEY LOCK**, BPM TAP, loop, hot
   cue, dan SYNC seperti pada perangkat CDJ.
6. Atur EQ/filter/fader/crossfader di Mixer. Untuk headphone: pilih output
   4 channel, atau aktifkan **SPLIT CUE** pada output stereo lalu tekan PFL.
7. Buka **Remixer / Sampler**, **FX Chains & Auto DJ**, **Library**,
   **MIDI & Keyboard**, **Skins & Layout**, atau **Record & Live Broadcast**
   di tab bawah.

## Troubleshooting audio di Linux (ALSA)

Gejala yang paling sering dilaporkan:

```text
ALSA lib pcm_route.c:886:(find_matching_chmap) [error.pcm] Found no matching channel map
```

Penyebabnya bukan DSP aplikasi, melainkan ALSA/driver yang diminta membuka
jumlah channel yang tidak punya *channel map* (mis. 4 channel pada perangkat
stereo/HDMI, atau konfigurasi `default` yang tidak konsisten). DJDeX menangani
ini dengan:

1. Membaca `supported_output_configs()` dan hanya memakai channel count yang
   benar-benar diekspos perangkat.
2. Mencoba kandidat berurutan: pilihan pengguna → **stereo (2 ch)** → default
   perangkat → mono, lalu format f32/i16/u16.
3. Menampilkan pesan error yang menyebut channel map dan saran perbaikan,
   bukan menggagalkan engine diam-diam.
4. Menyediakan pilihan **Channel output** di panel Audio Output; pilihan hanya
   berisi channel yang dilaporkan perangkat.

Langkah manual bila masih muncul:

- Pilih **Auto — stereo** pada *Channel output*, lalu terapkan ulang.
- Gunakan perangkat `default` (PipeWire/PulseAudio) alih-alih `hw:`/HDMI
  multichannel, atau pastikan `snd_pcm` chmap tersedia untuk perangkat itu.
- Cek perangkat dengan `aplay -l` dan uji stereo dengan `speaker-test -c 2`.
- Untuk headphone, aktifkan **SPLIT CUE** (L = cue, R = master) atau gunakan
  antarmuka audio 4 channel yang mendukung master 1/2 + cue 3/4.
- Buffer terlalu kecil dapat menimbulkan xrun; mulai dari 256 frame.
- Jika memakai JACK, pastikan sample rate JACK sama dengan pilihan di aplikasi.

## Struktur proyek

```text
djdex/
├─ src/                              # React: components, stores, lib/ipc, styles
│  ├─ components/DeckPanel.tsx       # deck, transport, platter, hot cue, loop
│  ├─ components/MixerPanel.tsx      # channel strip, crossfader, master, cue
│  ├─ components/Waveform.tsx        # canvas horizontal/vertikal + beatgrid
│  ├─ components/SkinPanel.tsx       # galeri, editor, impor/ekspor skin
│  ├─ components/RecordPanel.tsx     # rekaman master + live broadcast
│  ├─ stores/{audioStore,deckStore,mixerStore,skinStore,recordStore,...}.ts
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs, lib.rs, commands.rs, state.rs, error.rs
│  │  ├─ audio/                      # engine, deck, mixer, decoder, resampler,
│  │  │                              # timestretch, limiter, fx, autodj,
│  │  │                              # recorder, broadcast, device
│  │  ├─ dsp/                        # biquad, eq, filter, fx
│  │  ├─ analysis/                   # waveform, bpm, key, track
│  │  ├─ sampler/                    # pad, bank, sequencer, synth
│  │  ├─ library/                    # db, scanner, playlist, preview
│  │  ├─ midi/                       # device, mapping, dispatcher, keyboard
│  │  └─ skin/                       # manifest, loader, tests
│  ├─ icons/, capabilities/, Cargo.toml, tauri.conf.json
├─ skins/                            # classic-club, battle-scratch,
│                                    # producer-remix, tour-pro
├─ docs/ARSITEKTUR.md                # alur sinyal, thread model, dependensi
├─ docs/BUILD_PER_OS.md              # prasyarat & packaging per OS
├─ CHANGELOG.md, LICENSE
```

## Arsitektur singkat

```text
UI React ──invoke──► Tauri command ──► AudioEngine (atomic + channel)
                                          │  deck worker: Symphonia → resample → WSOLA → rtrb
                                          │  sampler/sequencer, preview, recorder, broadcast
                        audio host thread (pemilik cpal::Stream)
                                          │
                 callback CPAL: deck FX → EQ → filter → fader
                                → crossfader → sampler → master FX
                                → master volume → limiter → soft clip
                                → output (master + cue / split cue)
                                          │
                            WASAPI / CoreAudio / ALSA
```

Callback audio tidak melakukan alokasi, lock, I/O, atau panic. Posisi deck
dihitung dari frame yang benar-benar dikonsumsi. Seek/load memakai **epoch
handshake**. Detail lengkap ada di [`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md).

## Roadmap

| Fase | Fokus | Status |
| --- | --- | --- |
| 1 | Scaffold Tauri, IPC, CPAL, deteksi device, test tone | ✅ |
| 2 | Decoder Symphonia + deck + waveform | ✅ |
| 3 | Time-stretch, pitch, key lock, BPM/key detection | ✅ |
| 4 | Mixer: EQ, filter, fader, crossfader, limiter, cue | ✅ |
| 5 | Dua deck: platter, hot cue, loop, beat jump, sync | ✅ |
| 6 | FX chain + Auto DJ | ✅ |
| 7 | Remixer/sampler + step sequencer | ✅ |
| 8 | Library SQLite, scan, playlist, analisis batch | ✅ |
| 9 | MIDI Learn + keyboard mapping + LED feedback | ✅ |
| 10 | Skin/layout engine + 4 template + editor tema | ✅ |
| 11 | Rekaman WAV, live broadcast, audio settings, polish | ✅ |
| 12 | Packaging semua OS + CI/CD + dokumentasi final | ⏳ berikutnya |

Catatan arah pengembangan: engine saat ini membuka **dua deck fisik**. Template
"Tour Pro" menggantikan klaim "Four-Deck Pro" yang sebelumnya belum didukung
engine; ekspansi empat deck memerlukan perluasan mixer (4 channel strip + FX
per deck) dan akan dikerjakan setelah Fase 12.

## Kualitas

- `#![forbid(unsafe_code)]`; jalur audio tanpa alokasi/lock/panic.
- **80 unit test Rust** lulus: dB/soft clip, oscillator, render block, decoder
  WAV, resampler, WSOLA, waveform, transport deck, BPM, key Camelot, biquad/EQ/
  filter, limiter, crossfader, cue, mixer clamp, sampler/synth/sequencer, bank
  zip, library SQLite/crate/smart playlist/history/M3U, MIDI parsing/jog wheel/
  learn/keyboard, skin factory/JSON/TOML/switch/custom/export-import, dan
  pemilihan channel ALSA.
- `cargo fmt` + `cargo clippy --all-targets -- -D warnings` bersih.
- Target performa: latensi output < 15 ms pada buffer 256 frame @48 kHz, tanpa
  xrun pada beban normal, CPU idle rendah.

## Lisensi

MIT — lihat [`LICENSE`](LICENSE). Catatan lisensi dependensi (termasuk Symphonia
MPL-2.0) ada di `docs/ARSITEKTUR.md` bagian 9.

Kredit: **Kangpcode** · dibangun dengan Rust, Tauri, CPAL, dan Symphonia.

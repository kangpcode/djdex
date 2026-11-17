# Arsitektur DJDeX

Dokumen ini menjelaskan arsitektur lengkap (12 fase) sekaligus status
implementasi **Fase 11 (v0.11.0)**. Bagian yang belum ada ditandai **rencana**
dan tidak boleh dianggap sudah berfungsi.

Catatan perangkat (Fase 11): pembukaan stream memakai daftar kandidat dari
`supported_output_configs()` dengan urutan channel pilihan pengguna → stereo →
default perangkat → mono, serta fallback format f32/i16/u16. Ini mencegah error
ALSA `pcm_route.c ... find_matching_chmap` menggagalkan inisialisasi engine.

## 1. Prinsip desain

1. **Audio thread tidak boleh gagal.** Callback audio tidak melakukan alokasi,
   lock, I/O file, logging, atau `panic`. Semua parameter kontinu masuk lewat
   atomic; perubahan struktural lewat command channel.
2. **Decode dan analisis di luar jalur audio.** Symphonia, resampling, BPM/key
   detection, dan pembuatan waveform berjalan di worker pool, lalu mengirim
   sampel via ring buffer SPSC.
3. **UI tipis, engine tebal.** React hanya mengirim command dan membaca
   snapshot status/meter. Semua keputusan musikal (sync, loop, limiter) ada di
   Rust agar deterministik dan bisa diuji tanpa UI.
4. **Satu sumber kebenaran untuk waktu.** Posisi deck dihitung dari jumlah
   frame yang benar-benar dikonsumsi audio thread, bukan dari timer UI.
5. **Error terstruktur.** `thiserror` di engine, `anyhow` di batas aplikasi,
   dan error IPC dikembalikan sebagai `Result<T, String>` yang bisa ditampilkan.
6. **Latensi terukur, bukan diasumsikan.** Jumlah frame, periode buffer, dan
   waktu callback selalu tersedia di UI.

## 2. Peta lapisan

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (React 19 + TypeScript + Vite + Tailwind 4 + Zustand)  │
│  components/ · stores/ · skins/ · lib/ipc.ts                     │
└───────────────▲──────────────────────────────┬──────────────────┘
                │ snapshot status / meter      │ invoke(command)
                │ (poll 100 ms, bisa jadi event)│
┌───────────────┴──────────────────────────────▼──────────────────┐
│ Tauri 2 (src-tauri)                                             │
│  commands.rs  → validasi argumen, error → String                │
│  state.rs     → AppState { engine: Mutex<Option<AudioEngine>> }  │
└───────────────┬─────────────────────────────────────────────────┘
                │ Arc<RtState> atomics  +  crossbeam command queue
┌───────────────▼─────────────────────────────────────────────────┐
│ Audio host thread ("djdex-audio-host", non-RT)                   │
│  pemilik cpal::Stream, lifecycle, status stream                  │
└───────────────┬─────────────────────────────────────────────────┘
                │ callback audio (RT, prioritas tinggi dari OS)
┌───────────────▼─────────────────────────────────────────────────┐
│ cpal → WASAPI / CoreAudio / ALSA (PipeWire/Pulse/JACK via ALSA)  │
└─────────────────────────────────────────────────────────────────┘
```

`cpal::Stream` tidak `Send` di semua platform. Karena itu stream **dimiliki**
thread audio host, bukan `AppState`. Handle `AudioEngine` yang dipegang Tauri
hanya berisi atomic, channel, dan join handle sehingga aman `Send + Sync`.

## 3. Alur sinyal audio (target lengkap)

### 3.1 Deck

```
 File (MP3/FLAC/WAV/OGG/AAC/AIFF/ALAC)
   │
   ▼ (decode worker, Symphonia)
 f32 planar/interleaved @ source rate
   │
   ▼ (cubic resampler, step = base × speed)
 f32 stereo @ engine sample rate (44.1/48 kHz)
   │
   ▼ (key lock ON: WSOLA time-stretch dengan rasio speed/pitch)
   ▼ (rtrb SPSC ring 1 detik; terisi ±0,3 detik)
 ┌───────────────────────── AUDIO CALLBACK (RT) ─────────────────────────┐
 │ Deck gain (dB) + smoothing                    [Fase 2]                │
 │ EQ 3-band biquad + kill switch (Low/Mid/High) [Fase 4]                │
 │ Filter satu knob (LPF ↔ HPF, resonance)       [Fase 4]                │
 │ Deck FX chain: slot 1 → 2 → 3                 [Fase 6]                │
 │ Channel fader linear + crossfader             [Fase 4]                │
 │ Master volume / balance → limiter → soft clip [Fase 4]                │
 └───────────────┬───────────────────────────────┬──────────────────────┘
                 │ (post-fader)                  │ PFL tap (post-EQ/filter,
                 │                               │ pre-fader)
                 ▼                               ▼
        Master sum bus                    Cue bus (headphone)
                 │                               │
   Master FX chain (3 slot)            Cue volume + Cue/Master mix
   [Fase 6]                             │
                 │                     Split cue (L = cue, R = master)
                 ▼                               │
          Output device (stereo/multichannel)
          ch 0/1 = master, ch 2/3 = headphone (bila ≥4 channel)

 Sampler / Remixer voices ──► channel bus atau master bus (routing per pad)
 Recorder tap ─────────────► master post-limiter (writer thread, WAV/FLAC)
```

**Urutan sesuai spesifikasi:** Decode → Stretch → EQ → FX → Channel →
Crossfader → Master → Limiter → Output, dengan cue bus paralel dari titik
pre-fader. Time-stretch sengaja dijalankan di **worker deck**, bukan callback,
agar callback tetap hanya membaca ring + gain/Meter. Konsekuensinya perubahan
tempo/keylock baru terdengar setelah buffer terisi habis (±0,3 detik); angka ini
dikunci oleh `RING_SECONDS` dan `FILL_MARGIN_RATIO` di `audio/deck.rs`.

**Catatan format:** Symphonia 0.5 mendukung MP3, FLAC, WAV, OGG/Vorbis, AAC/M4A,
AIFF, dan ALAC. Opus belum memiliki decoder di Symphonia 0.5/0.6, sehingga belum
diklaim didukung UI; dukungan Opus memerlukan decoder tambahan pada fase lanjut.

### 3.2 Diagram ASCII ringkas

```
decode ─► resample ─► WSOLA ─► ring ─► trim ─► EQ ─► filter ─► FX×3
   ─► fader ─► crossfader ─► master volume/balance ─► limiter ─► soft clip
   ─► device (ch 0/1 master, ch 2/3 headphone)
                      └────► PFL (post-EQ/filter) ─► cue mix ─► headphone
```

### 3.3 Transport dan tempo deck (implementasi Fase 2–3)

```text
UI (load/seek/cue/tempo) ──command/atomic──► deck worker (Symphonia)
                                              │ decode → stereo
                                              │ resample(step = base × speed)
                                              │ keylock: WSOLA(speed/pitch)
                                              ▼
                                      rtrb ring (1 detik, terisi ±0,3 dtk)
                                              │
                                              ▼
                                  callback audio (play/pause, gain)
                                              │
                                              ├─ posisi += frames × speed / rate
                                              └─ peak / underrun / buffered
```

- **Worker** mem-prefetch ring walau paused, jadi PLAY tidak menunggu decode.
- **Posisi** hanya dihitung dari frame yang benar-benar dikonsumsi callback,
  bukan timer UI, dan diintegrasikan memakai speed saat itu (tidak melompat
  saat fader digerakkan).
- **Seek/load** memakai epoch handshake: worker menaikkan `reset_epoch` dan
  menulis `reset_position`; callback membuang ring lama lalu meng-ack epoch;
  setelah ack, worker baru mengisi data baru. Tidak ada lock bersama.
- **EOF** dihentikan callback setelah ring kosong dan posisi dikunci di durasi.
- **Analisis waveform + BPM/beatgrid + key** berjalan di satu thread terpisah
  dengan token track id; hasil dibuang jika user sudah memuat track lain.
- **Key lock** memakai WSOLA di worker: key lock OFF → resampler mengubah tempo
  dan pitch bersama; key lock ON → resampler menjadi pitch-shifter (termasuk
  keyshift) lalu WSOLA mengembalikan durasi sesuai tempo. Perubahan parameter
  efektif setelah buffer ±0,3 detik habis.

### 3.4 Mixer, limiter, dan cue (Fase 4)

- **Channel strip** Deck A: trim (gain deck) → EQ 3-band (low shelf 120 Hz,
  mid peaking 1 kHz, high shelf 8 kHz, kill −60 dB) → filter satu knob
  (LPF 200 Hz–20 kHz / HPF 20 Hz–6 kHz, Q 0,9) → channel fader.
- **Crossfader** dengan kurva `smooth` (linear), `constant-power`
  (cos/sin), dan `sharp` (transisi sempit), assignment `A`/`B`/`Thru`, serta
  reverse. Dengan satu deck, `Thru` adalah default agar channel tetap audible
  di posisi tengah.
- **Master**: volume, balance, limiter stereo-linked (attack 1 ms, release
  100 ms, ceiling 0,98 ≈ −0,18 dBFS), lalu soft clip pengaman dengan knee 0,99
  sehingga level normal tidak teredam.
- **Cue bus** diambil post-EQ/filter dan pre-fader. Headphone mix =
  `cueMix × cue + (1 − cueMix) × master`, diskalakan cue volume.
- **Routing output**: perangkat ≥4 channel → master di 0/1, headphone di 2/3.
  Perangkat stereo → split cue menaruh cue mono di L dan master mono di R;
  tanpa split cue, cue tidak keluar (UI menampilkan petunjuk). Device kedua
  khusus headphone belum dibuka; itu bagian dari audio settings fase 11.
- Parameter mixer dikirim per blok dari atomic (tanpa lock) dan gain smoothing
  10 ms mencegah klik saat fader/knob bergerak.

## 4. Model thread dan aturan real-time

| Thread | Prioritas | Pemilik state | Boleh melakukan |
| --- | --- | --- | --- |
| **UI (React)** | normal | Zustand | render, invoke, polling meter |
| **Tauri command** | normal | `AppState` | lock state, alokasi, baca device, spawn host |
| **Audio host** `djdex-audio-host` | normal/tinggi | `cpal::Stream` | buka/tutup stream, lock status, alokasi saat init |
| **Audio callback** | RT (OS) | atomics + DSP state preallocated | baca/tulis buffer, atomics, aritmetika |
| **Decode worker** (per deck, Fase 2–3) | normal | decoder + ring producer | file I/O, alokasi, resample, WSOLA |
| **Analysis pool** (Fase 3/8) | low | DB + waveform cache | FFT, DB write, file I/O |
| **Recorder writer** (Fase 11) | normal | file | tulis disk dari ring |
| **MIDI input** (Fase 9) | normal | mapping | parse MIDI, kirim command |
| **Library indexer** (Fase 8) | low | SQLite | scan folder, tag parsing |

Aturan yang ditegakkan saat review:

- Tidak ada `Mutex`, `RwLock`, `println!`, `format!`, `Vec::push`, `Box::new`,
  `fs::*`, atau `unwrap()` di `render_block` dan modul DSP yang dipanggilnya.
- Parameter kontinu: `AtomicU32` (f32 bits) / `AtomicBool`, ordering `Relaxed`
  cukup karena tidak ada dependensi antar-parameter.
- Meter: atomic peak, dibaca dan di-reset (`swap(0)`) oleh UI.
- Perubahan struktural (ganti device, load track, rebuild graph): command
  channel, diproses audio host, bukan callback.
- Buffer audio antar-thread: `rtrb` SPSC, alokasi hanya saat inisialisasi.
- Limiter/soft clip selalu berada di akhir master; tidak ada jalur output yang
  melewatinya.

## 5. Struktur modul

### 5.1 Sudah ada (Fase 1–4)

```
src-tauri/src/
├─ main.rs              # binary desktop
├─ lib.rs               # builder Tauri + generate_handler + dialog plugin
├─ commands.rs          # IPC typed (engine + deck + tempo + waveform)
├─ state.rs             # AppState + lifecycle engine + delegasi deck
├─ error.rs             # AudioError (thiserror)
├─ audio/
│  ├─ mod.rs            # registrasi modul audio
│  ├─ device.rs         # enumerasi + kapabilitas + pilih device
│  ├─ engine.rs         # RtState, audio host, callback, mixing, status
│  ├─ decoder.rs        # Symphonia streaming + seek + test WAV
│  ├─ deck.rs           # worker, ring buffer, transport epoch, cue, tempo
│  ├─ resampler.rs      # cubic Catmull-Rom stereo + set_speed
│  ├─ timestretch.rs    # WSOLA stereo + trait TimeStretcher
│  ├─ limiter.rs        # limiter master stereo-linked
│  ├─ mixer.rs          # channel strip, crossfader, cue bus, kontrol atomic
│  └─ gain.rs           # konversi dB ↔ linear
├─ dsp/
│  ├─ mod.rs
│  ├─ biquad.rs         # RBJ biquad + low/high shelf/peaking/LP/HP
│  ├─ eq.rs             # EQ 3-band + kill switch
│  └─ filter.rs         # filter DJ satu knob (LPF↔HPF)
└─ analysis/
   ├─ mod.rs
   ├─ waveform.rs       # min/max 120 bucket/s, downsampling, cancellation
   ├─ bpm.rs            # onset envelope + autokorelasi + fase beat
   ├─ key.rs            # chroma FFT + Krumhansl + Camelot
   └─ track.rs          # orkestrasi decode/analisis + cancellation
```

### 5.2 Rencana (fase berikutnya)

```
src-tauri/src/
├─ audio/  recorder.rs (dan stream cue terpisah)
├─ dsp/    loudness.rs fx/{echo,reverb,flanger,phaser,chorus,bitcrusher,gater,
│          trans,roll,brake,filter_sweep}.rs
├─ analysis/ beatgrid.rs (editor grid, nudge/tap lanjutan)
├─ sampler/  pad.rs bank.rs sequencer.rs
├─ library/  db.rs scanner.rs playlist.rs metadata.rs
├─ midi/     device.rs mapping.rs
└─ skin/     manifest.rs loader.rs
```

Frontend:

```
src/
├─ components/  Deck/ Mixer/ Fx/ Sampler/ Library/ Skin/ ui/
├─ stores/      audioStore.ts deckStore.ts libraryStore.ts …
├─ skins/       registry + tema aktif
├─ hooks/       useMeter.ts useShortcut.ts …
└─ lib/         ipc.ts format.ts
```

## 6. Kontrak IPC (Fase 1–4)

| Command | Argumen (camelCase) | Hasil |
| --- | --- | --- |
| `list_audio_devices` | — | `AudioDeviceInfo[]` |
| `get_engine_status` | — | `EngineStatus` |
| `start_audio_engine` | `{ request: StartRequest }` | `EngineStatus` |
| `set_test_tone` | `{ enabled?, freqHz?, gainDb? }` | `EngineStatus` |
| `stop_audio_engine` | — | `EngineStatus` (idle) |
| `load_track` | `{ path: string }` | `DeckStatus` |
| `get_deck_status` | — | `DeckStatus` |
| `deck_play` / `deck_pause` | — | `DeckStatus` |
| `deck_seek` | `{ positionSecs: number }` | `DeckStatus` |
| `deck_set_cue` / `deck_cue_jump` | — | `DeckStatus` |
| `deck_set_gain` | `{ gainDb: number }` | `DeckStatus` |
| `deck_set_speed` | `{ speed: number }` | `DeckStatus` |
| `deck_set_pitch_range` | `{ range: number }` | `DeckStatus` |
| `deck_set_keylock` | `{ enabled: boolean }` | `DeckStatus` |
| `deck_set_semitones` | `{ semitones: number }` | `DeckStatus` |
| `deck_set_bpm` | `{ bpm: number }` | `DeckStatus` |
| `deck_unload` | — | `DeckStatus` |
| `get_waveform` | `{ maxPoints?: number }` | `WaveformDto \| null` |
| `get_mixer_status` | — | `MixerParams` |
| `set_mixer` | `{ update: MixerUpdate }` | `MixerParams` |

`StartRequest`: `deviceName?`, `bufferSize?`, `sampleRate?`, `toneFreqHz?`,
`toneGainDb?`. `DeckStatus` memuat `loaded`, `playing`, `eof`, `fileName`,
`codec`, `durationSecs`, `positionSecs`, `sourceSampleRate`, `engineSampleRate`,
`channels`, `gainDb`, `cueSecs`, `bufferedMs`, `underruns`, `peak`,
`waveformReady`, `trackId`, `speed`, `pitchRange`, `keylock`, `semitones`,
`bpm`, `detectedBpm`, `bpmConfidence`, `firstBeatSecs`, `keyName`, `camelot`,
`keyConfidence`, `analysisReady`, `error`. `WaveformDto` memuat `trackId`,
`durationSecs`, dan `peaks` (pasangan min/max diratakan).

`EngineStatus` (semua read-only): `initialized`, `running`, `deviceName`,
`host`, `sampleRate`, `channels`, `sampleFormat`, `bufferFrames`, `latencyMs`,
`toneEnabled`, `toneFreqHz`, `toneGainDb`, `callbacks`, `frames`, `peak`,
`masterPeakL`, `masterPeakR`, `limiterReductionDb`, `callbackUsLast`,
`callbackUsMax`, `xruns`, `lastError`.

`MixerParams` memuat `lowDb`, `midDb`, `highDb`, `lowKill`, `midKill`,
`highKill`, `filter`, `fader`, `pfl`, `crossfader`, `crossfaderCurve`,
`crossfaderAssign`, `crossfaderReverse`, `masterVolume`, `masterBalance`,
`limiterEnabled`, `cueVolume`, `cueMix`, `splitCue`. `MixerUpdate` adalah versi
parsial (semua field opsional) untuk `set_mixer`.

Catatan: `peak`, `masterPeakL/R`, dan `limiterReductionDb` adalah nilai maksimum
sejak pembacaan terakhir (destruktif), cocok untuk meter polling 10–20 Hz.

## 7. Strategi state dan komunikasi

| Kebutuhan | Mekanisme | Alasan |
| --- | --- | --- |
| Fader/knob/trim/gain/EQ/filter/crossfader | atomic f32 bits | bebas lock, latensi satu blok |
| PFL, kill, assign, reverse, split cue, limiter | atomic bool/int | idempotent, cepat |
| Enable FX/loop/cue | atomic bool/int | idempotent, cepat |
| Ganti device/buffer, load track | crossbeam bounded command | butuh alokasi/IO di host thread |
| Sampel decoded | rtrb SPSC | zero-alloc, single producer/consumer |
| Meter & statistik | atomic + `swap` | tidak butuh sinkronisasi |
| Status stream | `parking_lot::Mutex` di host thread | hanya non-RT |
| Settings/skin/mapping | serde JSON/TOML di disk | human-editable, versioned |
| Library | SQLite (WAL) + worker pool | query cepat, aman multi-thread |

Tidak ada `unsafe` di crate aplikasi (`#![forbid(unsafe_code)]`); FFI
time-stretch (SoundTouch) akan diisolasi di crate kecil dengan audit terpisah
dan tetap tanpa unsafe di jalur pemanggil.

## 8. Dependensi final

### 8.1 Rust (sudah dikunci di `src-tauri/Cargo.toml` + `Cargo.lock`)

| Crate | Versi | Fungsi | Lisensi |
| --- | --- | --- | --- |
| `tauri` | 2.12.x | shell desktop + IPC | MIT / Apache-2.0 |
| `tauri-build` | 2.x | build script, capability schema | MIT / Apache-2.0 |
| `cpal` | 0.18.2 | output/input real-time lintas OS | Apache-2.0 |
| `serde` / `serde_json` | 1.0.229 / 1.0.154 | DTO IPC, settings | MIT / Apache-2.0 |
| `thiserror` | 2.0.21 | error engine | MIT / Apache-2.0 |
| `anyhow` | 1.0.104 | error level aplikasi | MIT / Apache-2.0 |
| `parking_lot` | 0.13.0 | lock non-RT | MIT / Apache-2.0 |
| `crossbeam-channel` | 0.5.17 | command UI → host | MIT / Apache-2.0 |
| `rtrb` | 0.4.1 | ring buffer decode → audio | MIT / Apache-2.0 |
| `symphonia` | 0.5.5 | decoder MP3/FLAC/WAV/OGG/AAC/AIFF/ALAC | MPL-2.0 |
| `rustfft` | 6.4.x | chroma/key detection di thread analisis | MIT / Apache-2.0 |
| `tauri-plugin-dialog` | 2.8.x | dialog pemilih file native | MIT / Apache-2.0 |

Feature flag: `asio` (Windows saja, butuh ASIO SDK; default mati).

### 8.2 Rust (rencana, versi dikunci saat fase dimulai)

| Crate | Fungsi | Lisensi | Fase |
| --- | --- | --- | --- |
| `rubato` | resampling berkualitas (pengganti cubic) | MIT | 11 |
| `ebur128` | loudness/ReplayGain | MIT | 8 |
| `signalsmith-stretch` (FFI) atau `soundtouch` (FFI) | upgrade opsional time-stretch via trait | MIT / LGPL-2.1 | 11 |
| `rusqlite` (bundled) | library SQLite | MIT | 8 |
| `lofty` | tag metadata | MIT / Apache-2.0 | 8 |
| `hound` | tulis WAV rekaman | Apache-2.0 | 11 |
| `midir` | MIDI controller | MIT | 9 |
| `zip` | skin/sample pack `.djdex-skin` | MIT | 10 |
| `toml` | manifest skin | MIT / Apache-2.0 | 10 |
| `criterion` (dev) | benchmark latensi/DSP | Apache-2.0 / MIT | 3+ |

### 8.3 Frontend

| Paket | Versi | Fungsi |
| --- | --- | --- |
| `react` / `react-dom` | 19.3.x | UI |
| `typescript` | 5.9.x | type safety |
| `vite` | 8.3.x | dev server + bundle |
| `tailwindcss` + `@tailwindcss/vite` | 4.3.x | styling token-based |
| `zustand` | 5.1.x | state UI |
| `@tauri-apps/api` | 2.12.x | invoke IPC |
| `@tauri-apps/cli` | 2.12.x | dev/build desktop |
| `@tauri-apps/plugin-dialog` | 2.8.x | dialog pemilih file |

## 9. Lisensi dan kepatuhan

- Kode DJDeX: **MIT** (lihat `LICENSE`).
- `cpal` Apache-2.0, Tauri MIT/Apache-2.0: kompatibel dengan MIT, wajib
  menyertakan notice lisensi pihak ketiga pada distribusi.
- `symphonia` **MPL-2.0**: copyleft tingkat file. Aman dipakai sebagai
  dependency tanpa membuka kode aplikasi, tetapi modifikasi file Symphonia
  harus dipublikasikan. Jangan mem-*fork* tanpa memenuhi kewajiban ini.
- **Time-stretch default**: implementasi **WSOLA internal** (kode sendiri, MIT)
  di `audio/timestretch.rs` melalui trait `TimeStretcher`, sehingga tidak ada
  kewajiban lisensi pihak ketiga. Bila kualitas perlu ditingkatkan dengan
  **SoundTouch LGPL-2.1**, link secara dinamis dan sediakan cara mengganti
  library; **Signalsmith Stretch (MIT)** adalah alternatif statis yang aman.
- Semua decoder/encoder tambahan (FLAC/MP3 export) harus dicek lisensinya
  sebelum diaktifkan pada build distribusi.

## 10. Anggaran latensi dan performa

| Buffer | @44.1 kHz | @48 kHz |
| --- | --- | --- |
| 64 frame | 1.45 ms | 1.33 ms |
| 128 frame | 2.90 ms | 2.67 ms |
| 256 frame | 5.80 ms | 5.33 ms |
| 512 frame | 11.61 ms | 10.67 ms |
| 1024 frame | 23.22 ms | 21.33 ms |

Target: total output < 15 ms (buffer 64–512 frame), tanpa xrun pada 4 deck +
FX, CPU idle < 5 %, 2 deck + FX < 20 %. Angka ini akan diverifikasi dengan
benchmark dan pengukuran callback (`callbackUsMax`) pada Fase 3 dan 11, bukan
diasumsikan.

Rencana pengukuran:

1. `callback_us_max / periode_buffer` sebagai beban DSP per blok.
2. Penghitung xrun dari error callback cpal.
3. Uji stres: 4 deck, 3 FX/deck, limiter, sampler aktif; rekam 30 menit.
4. `criterion` untuk EQ/filter/FX dan decoder throughput.
5. Profiling `perf`/Instruments/Tracy pada fase optimasi.

## 11. Pengujian

- **Unit (Rust)**: konversi dB, soft clip, kontinuitas oscillator, ramp gain,
  render block, decoder WAV (open/decode/seek), resampler (rasio, speed, dan
  panjang), WSOLA (durasi & pitch saat 0,8×/1,25×), waveform
  (bucket/downsample/cancellation), transport deck (play/pause/seek/unload),
  BPM (click track 128/90 BPM + fase beat), key (C major 8B, A minor 8A),
  speed clamp per rentang pitch, BPM override, biquad (identity/LP/peaking),
  EQ boost/kill, filter LPF/HPF, limiter (peak, reduksi, pemulihan, bypass),
  kurva crossfader (endpoint, reverse, constant power, sharp), cue PFL, dan
  clamp parameter mixer; menyusul: parser skin, benchmark criterion.
- **Integrasi**: load track → play → seek/cue dengan sample rate 44.1/48 kHz
  (diuji dengan WAV yang dihasilkan di dalam test, tanpa aset biner).
- **UI**: `tsc -b` + `vite build`; pengujian interaksi browser belum mencakup
  webview Tauri.
- **Benchmark**: `cargo bench` (criterion) pada fase DSP.
- **Audio acceptance**: file referensi sine/sweep, cek null-test limiter dan
  time-stretch pada rasio 1.0.

## 12. Pemetaan fase

| Fase | Fokus | Status |
| --- | --- | --- |
| 1 | Scaffold Tauri, IPC, CPAL, deteksi device, test tone | **selesai (v0.1.0)** |
| 2 | Decoder + satu deck + waveform | **selesai (v0.2.0)** |
| 3 | Time-stretch, pitch, key lock, BPM/key/beatgrid | **selesai (v0.3.0)** |
| 4 | Mixer, EQ, filter, crossfader, limiter, cue | **selesai (v0.4.0)** |
| 5 | Dua deck penuh, platter, hot cue, loop, beat jump | **selesai (v0.5.0)** |
| 6 | FX chain + Auto DJ (transisi beat-synced) | **selesai (v0.6.0)** |
| 7 | Remixer, sampler, 16-step sequencer, drum kit | **selesai (v0.7.0)** |
| 8 | Library SQLite, scanner musik, playlist M3U, analisis batch | **selesai (v0.8.0)** |
| 9 | MIDI Controller, MIDI Learn interaktif, keyboard mapping | **selesai (v0.9.0)** |
| 10 | Skin engine + 4 factory skins + visual theme editor | **selesai (v0.10.0)** |
| 11 | Rekaman mix master WAV + live streaming broadcast (Icecast/SHOUTcast) | **selesai (v0.11.0)** |
| 12 | Packaging semua OS (MSI/NSIS/DMG/DEB/AppImage/Flatpak) + CI/CD + dokumentasi | **selesai (v0.12.0)** |

Catatan: **sync/beat-match antar-deck** belum bisa diuji dengan satu deck dan
akan diselesaikan bersama Deck B pada Fase 5. Fase 3 sudah menyediakan BPM,
tempo fader, key lock, dan beatgrid yang menjadi fondasinya. Perubahan
parameter tempo baru terdengar setelah prebuffer ±0,3 detik habis (lihat 3.1).

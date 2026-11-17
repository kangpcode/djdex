# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/) dan
[Semantic Versioning](https://semver.org/).

## [0.9.0] - 2026-11-17

### Added — Fase 9: Integrasi MIDI Controller & MIDI Learn + Keyboard Mapping

- **Cross-Platform MIDI I/O Engine (`src-tauri/src/midi/device.rs`) via `midir`**:
  - Deteksi dan pemindaian port input dan output fisik serta virtual MIDI secara dinamis.
  - Koneksi thread-safe ke perangkat MIDI fisik dengan callback stream non-blocking berlatensi ultra-rendah (< 1 ms).
  - Parser pesan biner MIDI standar: `NoteOn`, `NoteOff` (termasuk deteksi NoteOn velocity 0 sebagai NoteOff standar), `ControlChange`, dan `PitchBend` 14-bit.
  - Encoder `MidiEvent::to_bytes()` untuk serialisasi kembali pesan MIDI ke hardware controller.
- **Decoding Jog Wheel Relatif Hardware (`src-tauri/src/midi/types.rs`)**:
  - Dukungan decoding 4 mode gerakan jog wheel DJ profesional:
    - `RelativeTwoComp`: 7-bit two's complement standar (Pioneer DJ DDJ-400, DDJ-FLX4, DDJ-SB3).
    - `RelativeBinaryOffset`: center 64 binary offset (Traktor Kontrol, Numark Mixtrack).
    - `RelativeSignedBit`: sign-magnitude bit 6 (Hercules DJControl Inpulse 200/300).
    - `Absolute`: pemetaan absolut 0..127.
  - Translasi delta putaran menjadi seek scrubbing dan nudge tempo secara mulus.
- **Bidirectional Hardware LED Feedback Engine (`src-tauri/src/midi/dispatcher.rs`)**:
  - Mengirim kembali status audio engine ke perangkat controller fisik melalui port MIDI Out.
  - Indikator LED sinkron untuk Play/Pause (menyala saat playing), Cue Point (menyala saat cue point tersedia), Sync, Auto Loop, Headphone Cue (PFL), dan Hot Cues (menyala jika slot cue terisi).
  - Sinkronisasi instan seluruh status LED saat controller pertama kali tersambung (`sync_all_leds`).
- **Interactive MIDI Learn Engine (`src-tauri/src/midi/mapping.rs`)**:
  - Mode interaktif "Listen & Learn" untuk mengaitkan kontrol fisik controller secara langsung: cukup pilih aksi DJ di UI dan gerakkan tombol/fader/knob controller.
  - Pencegahan false trigger dari event NoteOff atau velocity 0 saat proses learning tombol.
  - Penimpaan otomatis dan pemetaan dinamis disimpan di RAM dan dapat diekspor ke file JSON.
- **Factory Presets & Custom Preset Manager**:
  - Preset bawaan:
    - *Pioneer DDJ-400 / DDJ-FLX4*: konfigurasi kanal penuh untuk Deck 1 (Ch 0) & Deck 2 (Ch 1), jog wheel two's complement, fader, EQ 3-band, filter Sound Color, PFL headphone cue, auto loop, hot cues 1..8, crossfader, dan browser rotary.
    - *Hercules DJControl Inpulse 300 / 200*: konfigurasi kanal ganda dengan signed-bit jog wheel decoding.
    - *Generic 2-Deck DJ Controller*: pemetaan standar 2-deck.
  - Penyimpanan dan pemuatan preset kustom berbasis format JSON di folder konfigurasi aplikasi.
- **Sistem Pemetaan Keyboard Komputer (`src-tauri/src/midi/keyboard.rs`)**:
  - Pintasan keyboard lengkap untuk workstation DJDeX tanpa controller hardware:
    - Deck 1: `Space` (Play/Pause), `C` (Cue), `S` (Sync), `1..4` (Hot Cues 1..4), `Q/W` (Pitch bend -/+), `E` (Loop toggle), `R/T` (Loop 1/2x & 2x).
    - Deck 2: `Shift+Space` (Play/Pause), `V` (Cue), `B` (Sync), `5..8` (Hot Cues 1..4), `U/I` (Pitch bend -/+), `O` (Loop toggle), `P/[` (Loop 1/2x & 2x).
    - Library & Browser: `ArrowUp / ArrowDown` (Scroll), `Enter` (Load to Deck 1), `Shift+Enter` (Load to Deck 2).
    - Sampler: `F1..F8` (Pemicu Sampler Pad 1..8).
  - Listener keyboard global terintegrasi di `src/App.tsx` dengan perlindungan fokus input/textarea dan pencegahan scroll pada tombol Space.
- **Antarmuka Pengguna React & Zustand Store (`src/components/MidiPanel.tsx`, `src/stores/midiStore.ts`)**:
  - Bilah koneksi perangkat MIDI In & MIDI Out (LED) dengan pemindaian ulang otomatis dan lencana status real-time.
  - Pemilih dan penyimpan preset controller DJ.
  - 4 sub-tampilan komprehensif:
    1. *Interactive MIDI Learn*: kisi kategori kontrol (Deck 1, Deck 2, Mixer, Sampler/FX) dengan status "Listening..." dan tombol "Learn" per aksi.
    2. *Tabel Pemetaan Aktif*: pencarian dan pemfilteran seluruh pemetaan aktif dengan kolom Channel, Message Type, Control #, Target Action, dan tombol hapus.
    3. *Pintasan Keyboard*: visualisasi tombol kbd dengan modifier Ctrl/Shift/Alt dan tombol reset pabrik.
    4. *Monitor Aktivitas MIDI Real-Time*: log streaming event MIDI masuk dengan timestamp, channel, type, control, dan visual bar nilai 0..127.
- **7 Unit Test Baru di Rust**: pengujian parsing NoteOn/NoteOff, parsing CC & PitchBend, serialisasi biner MIDI `to_bytes`, decoding keempat mode jog wheel, lookup factory presets DDJ-400 & Hercules, alur kerja interactive MIDI Learn, serta keyboard manager lookup & case-insensitivity. Total unit test Rust meningkat menjadi 72 test yang lulus 100%.

### Changed

- Versi aplikasi dinaikkan ke `0.9.0` (Rust `Cargo.toml`, `tauri.conf.json`, `package.json`, `App.tsx`, dan UI footer).
- Modul `midi` diekspos sebagai modul publik di `src-tauri/src/lib.rs` dan diintegrasikan ke `AppState` dan daftar command Tauri.
- Navigasi panel bawah di `App.tsx` ditambahkan tab "MIDI & Keyboard Mapping" dengan indikator lencana hijau emerald.

## [0.8.0] - 2026-11-17

### Added — Fase 8: Library, Database, Analisis Batch, dan Playlist

- Lapisan Database SQLite lokal berkecepatan tinggi `src-tauri/src/library/db.rs` berbasis `rusqlite` (bundled engine):
  - Skema relasional teroptimasi dengan index pencarian cepat untuk tabel `tracks`, `crates`, `crate_tracks`, `playlists`, `playlist_tracks`, dan `history`.
  - Operasi CRUD lengkap untuk track musik, pemetaan crate/sub-folder kategori DJ, playlist manual, dan smart playlist berbasis query aturan dinamis.
  - Penilaian track (bintang 1-5), penanda warna (color tagging), dan penghitung putaran lagu (play count).
  - Pencatatan riwayat pemutaran (DJ play history) secara otomatis saat lagu dimuat ke Deck A atau Deck B.
- Pemindai folder rekursif & ekstraktor metadata audio `src-tauri/src/library/scanner.rs`:
  - Ekstraksi tag ID3/metadata dengan crate `lofty`: judul lagu, nama artis, album, genre, tahun rilis, dan durasi audio.
  - Dukungan format audio komprehensif: MP3, FLAC, WAV, OGG/Vorbis, AAC, M4A, AIFF, ALAC.
  - Worker analisis audio batch di thread latar belakang (`djdex-batch-analyzer`): mendeteksi BPM, tangga nada musik & Camelot key (misal "8A", "11B"), serta loudness EBU R128 (LUFS) untuk setiap track yang belum teranalisis.
  - Pelacakan progres pemindaian dan analisis atomik untuk status responsif di antarmuka pengguna.
- Manajemen Crate & Playlist `src-tauri/src/library/playlist.rs`:
  - Kategori Crates manual untuk pengelompokan lagu fleksibel oleh DJ.
  - Smart Playlist dengan filter parameter otomatis (rentang BPM minimum/maksimum, key, genre, rating minimum).
  - Parser dan generator impor/ekspor playlist standar format M3U, M3U8, dan PLS.
- Pemutar Headphone Cue Preview (Browser Cue Player) `src-tauri/src/library/preview.rs`:
  - Memungkinkan DJ mendengarkan cuplikan audio track mana pun langsung melalui headphone (Cue Bus / PFL) sebelum memuatnya ke Deck A atau Deck B.
  - Cuplikan preview terisolasi sepenuhnya ke jalur headphone cue mixer dan tidak bocor ke output Master publik.
  - Player real-time lock-free yang didecode di background thread (`djdex-preview-decoder`) dengan resampler otomatis ke laju sampel engine.
  - Kontrol scrubbing / seeking interaktif dengan pelaporan posisi detik real-time.
- Antarmuka Browser DJ & Store React `src/components/LibraryPanel.tsx` dan `src/stores/libraryStore.ts`:
  - Panel perpustakaan bergaya profesional DJ workstation dengan navigasi pohon Crates & Playlists di sisi kiri.
  - Kolom pencarian instan multi-kategori (judul, artis, album, genre) dengan filter dan pengurutan multi-kolom (BPM, Key, Durasi, Rating, Plays, Tanggal).
  - Tombol aksi muat langsung ke Deck A (sian) dan Deck B (magenta), serta dukungan Drag & Drop file audio ke deck.
  - Bilah mini-player cuplikan headphone cue di bagian bawah tabel track dengan scrubber interaktif dan tombol stop cue.
  - Dialog native untuk pemindaian folder, pembuatan Crate baru, pembuatan Smart Playlist, serta impor/ekspor M3U.
  - Sub-tampilan riwayat pemutaran DJ (Play History) dengan penanda deck pemutar dan stempel waktu.
- 6 unit test baru untuk Library Database CRUD, Crates, Smart Playlists, Riwayat, dan Ekspor M3U; total 65 unit test Rust lulus 100%.

### Changed

- Versi aplikasi dinaikkan ke `0.8.0` (Rust `Cargo.toml`, `tauri.conf.json`, `package.json`, `App.tsx`, dan UI footer).
- `Mixer::process` di engine audio diperluas untuk menerima kanal stereo preview headphone cue secara aman tanpa alokasi memori.
- Pemuatan track ke deck di `AppState::load_track` sekarang otomatis memperbarui counter putaran lagu dan mencatat entri riwayat sesi pemutaran di SQLite database.

## [0.7.0] - 2026-11-17

### Added — Fase 7: Remixer/Sampler + Step Sequencer

- Mesin Sampler real-time lock-free `src-tauri/src/sampler/`:
  - Voice pool hingga 32 voice simultan dengan interpolasi sub-sampel linear, per-pad volume, semitone pitch-shift (-24..+24 st), BPM tempo sync, dan mute group cut-off anti-clash (misal closed/open hi-hat).
  - Mode pad lengkap: `OneShot`, `Loop`, `Hold` (berhenti saat dilepas), `Stutter` (retrigger instan ke 0), `DrumPad`, dan `CuePad`.
  - 4 Bank Kit pabrikan bawaan (`EDM Festival`, `Hip-Hop 808`, `House Classic`, `DJ Scratches & FX`) dengan 16 pad per bank yang langsung siap dimainkan seketika aplikasi dibuka tanpa memerlukan aset audio eksternal.
  - Generator instrumen dan efek DJ matematis murni `sampler/synth.rs`: Kick 808 & punchy kick, Snare, Hi-Hats, Clap multi-transient, Tom/Conga, Turntable vinyl scratch (baby scratch, chirp, transform), DJ Siren, Laser zap, Airhorn blast, dan Synth chord stab.
  - Step Sequencer 16-step (`sampler/sequencer.rs`): 4 track terdedikasi (Kick, Snare, Hi-Hat, Perc), memori 4 pattern per bank, pengaturan swing groove (0% - 75%), sinkronisasi tempo ke Master BPM, dan clocking frame-accurate langsung di audio callback tanpa alokasi heap.
  - Pemotongan audio langsung dari Deck: fitur `capture_deck_to_pad` untuk memotong 1–16 ketukan atau loop aktif dari Deck A/Deck B langsung menjadi sample pad baru menggunakan Symphonia decoder dan resampler otomatis.
  - Dukungan impor file audio eksternal (WAV, MP3, FLAC, OGG, AAC) ke pad mana pun via dialog file native.
  - Sistem ekspor dan impor Sample Pack format `.zip` (`sampler/bank.rs`) lengkap dengan manifest JSON dan file audio WAV standar via crate `zip` & `hound`.
- Integrasi audio engine & mixer:
  - Mixer master bus sekarang menerima input stereo sampler secara kontinu sebelum master limiter, dilengkapi master volume dan fade-out click-free.
  - State atomik `AtomicPadState` untuk polling UI berkecepatan tinggi tanpa overhead lock.
- Komponen antarmuka & store React:
  - Store Zustand `useSamplerStore` dengan polling berkala, aksi pemicu pad, konfigurasi parameter pad, dan manajemen sequencer.
  - Komponen `SamplerPanel`:
    - Pemilih 4 bank dengan badge neon dan judul kit.
    - Grid responsif 16 pad atau 8 pad dengan visual glowing saat dipicu, animasi ring progress, serta indikator mode & mute group.
    - Drawer/inspektor detail pad: penamaan, mode pemicu, mute group, slider volume & pitch semitone, toggle sync tempo, tombol muat file audio, dan pemotong bagian track dari Deck A/Deck B.
    - Sub-view 16-Step Sequencer interaktif: tombol Start/Stop dengan LED berkedip, kontrol BPM & Swing, pemilih pattern 1–4, 16 step button dengan penanda ketukan, dan playhead vertikal real-time.
    - Tombol MUTE ALL, kontrol Master Sampler Volume, serta ekspor/impor pack ZIP.
  - Integrasi tab navigasi bawah di `App.tsx` (`Remixer / Sampler & Sequencer`, `FX Chains & Auto DJ`, `Audio Output & Diagnostics`, atau `Show All Panels`).
  - Shortcut keyboard global: angka `1`–`8` memicu Pad 1–8 secara instan.
- 6 unit test baru untuk Sampler, Synth, Sequencer, dan Bank ZIP pack roundtrip; total 59 unit test Rust lulus 100%.

### Changed

- Versi aplikasi dinaikkan ke `0.7.0` (Rust `Cargo.toml`, `tauri.conf.json`, `package.json`, dan UI footer).
- `Mixer::process` diperluas untuk menerima kanal stereo sampler tanpa alokasi memori.

## [0.6.0] - 2026-11-17

### Added — Fase 6: FX Chain dan Auto DJ

- DSP FX real-time `dsp/fx.rs`: delay, echo, reverb (comb + all-pass), flanger,
  phaser, chorus, bitcrusher, gater, trans, roll, brake/spinback approximation,
  filter sweep, noise, dan wah. Semua buffer dialokasikan saat konstruksi dan
  tipe efek dapat diganti tanpa alokasi di callback.
- Rantai FX 3 slot untuk Deck A, Deck B, dan Master; wet/dry, tiga parameter,
  enable per slot, serta kontrol lock-free `audio/fx.rs` (`get_fx_status`,
  `set_fx`).
- Panel `FxPanel`: pemilih rantai, tipe efek, tombol ON/OFF, dan slider
  wet/dry + parameter per slot.
- Auto DJ di engine Rust (`audio/autodj.rs`): state machine pada thread
  `djdex-autodj` 50 Hz. Target di-sync BPM/fase (opsional), di-seek ke downbeat
  sefase deck aktif, lalu crossfader bergerak selama `crossfade_beats` ketukan.
  Deck lama di-pause setelah fade selesai.
- Mode Auto DJ: auto-start saat sisa track mendekati panjang crossfade,
  transisi manual, dan pembatalan yang mengembalikan crossfader.
- Snapshot `AutoDjStatus` (state, deck aktif/berikutnya, progress, durasi fade,
  pesan) + command `get_auto_dj_status`, `set_auto_dj`, `auto_dj_trigger`,
  `auto_dj_cancel`.
- `Deck::transport()`: snapshot transport tanpa `swap` meter, sehingga polling
  Auto DJ tidak mengosongkan peak yang dibaca UI.
- Store `autoDjStore` + panel Auto DJ terintegrasi di `FxPanel`; progress bar dan
  status transisi di-polling bersama status deck/mixer.
- 5 unit test Auto DJ (BPM efektif, posisi crossfader reverse, clamp parameter,
  pembatalan, roundtrip state); total 53 unit test Rust.

### Changed

- `MixerControls` sekarang dibagi sebagai `Arc` antara callback dan thread Auto
  DJ; penulisan crossfader tetap atomic.
- Deck dimiliki sebagai `Arc<Deck>` oleh engine agar thread kontrol dapat
  memakai API deck yang sama tanpa menyentuh callback audio.
- Versi aplikasi naik ke 0.6.0 (Rust, Tauri, npm, UI).

### Known limitations

- Auto DJ belum memuat track berikutnya otomatis karena library/queue baru
  tersedia pada Fase 8; kedua deck harus sudah dimuat.
- Waktu delay/echo masih dalam milidetik manual; sinkronisasi ketukan penuh dan
  Macro FX preset akan disempurnakan bersama library/performance phase.

## [0.5.0] - 2026-11-16

### Added — Fase 5: Dua Deck Penuh
- Engine membuka dua deck (A/B) dengan ring buffer terpisah; mixer memiliki dua channel strip, crossfader penuh, dan routing master/cue terpisah.
- Hot cue 8 slot per deck: set/trigger/hapus, posisi atomik, warna per slot.
- Loop: auto loop berbasis BPM (1/32..32 beat), manual IN/OUT, halve/double, beat jump (±1/±4/±8 beat), loop roll via drag.
- Jog wheel/platter virtual: cincin progress, piringan berputar, mode Vinyl (scratch via seek) dan CDJ (pitch bend sementara).
- Sync BPM + penyesuaian fase ketukan ke deck lain (`sync_decks`).
- Bend per deck untuk jog wheel CDJ.
- UI Deck B, platter, hot cue pads, loop, beat jump, sync; MixerPanel dua channel.

### Changed
- `DeckStatus` menambah `hotCues`, `loopActive`, `loopStartSecs`, `loopEndSecs`, `loopBeats`, `bend`.
- `MixerParams` kini memakai `channels[2]` alih-alih field datar channel A.
- Semua command deck menerima `deck: 0 | 1` (default 0); `get_deck_status`/`get_waveform` juga.
- Versi aplikasi naik ke 0.5.0 (Rust, Tauri, npm).

### Notes
- Loop pada batas menggunakan fade 2 ms untuk mengurangi klik; pencocokan fase worker/callback bersifat perkiraan.
- Belum ada scratch audio reverse true; mode vinyl memakai seek relatif.

## [0.4.0] - 2026-11-16

### Added — Fase 4: Mixer, Limiter, dan Cue Bus

- DSP biquad RBJ (`dsp/biquad.rs`): low/high shelf, peaking, lowpass, highpass,
  state stereo transposed direct form II, tanpa alokasi di jalur audio.
- EQ 3-band channel (`dsp/eq.rs`): low shelf 120 Hz, mid peaking 1 kHz, high
  shelf 8 kHz, dengan kill switch −60 dB dan recalc koefisien hanya saat berubah.
- Filter DJ satu knob (`dsp/filter.rs`): LPF 200 Hz–20 kHz, bypass di tengah,
  HPF 20 Hz–6 kHz, Q 0,9.
- Limiter master stereo-linked (`audio/limiter.rs`): attack 1 ms, release 100 ms,
  ceiling −0,18 dBFS, meter gain reduction.
- Mixer (`audio/mixer.rs`): channel fader, PFL pre-fader, crossfader dengan kurva
  smooth/constant-power/sharp, assign A/B/Thru, reverse, master volume/balance,
  cue volume/mix, split cue, dan smoothing gain 10 ms.
- Cue bus post-EQ/filter pre-fader; routing master 0/1 + headphone 2/3 pada
  perangkat ≥4 channel, atau split cue L/R pada output stereo.
- Engine status baru: peak master L/R dan reduksi limiter.
- Perintah IPC `get_mixer_status` dan `set_mixer` (update parsial).
- UI `MixerPanel`: channel strip A, kill switch, filter, fader, meter, PFL,
  crossfader + kurva/assign/reverse, master volume/balance/limiter, cue
  volume/mix/split cue, dan petunjuk routing headphone.
- 47 unit test Rust, termasuk biquad/EQ/filter, limiter, kurva crossfader, cue,
  dan clamp parameter mixer.

### Changed

- Soft clipper master sekarang linear sampai 0,99 (sebelumnya mengurangi sinyal
  1,0 menjadi 0,777) sehingga limiter tidak diikuti kompresi dini.
- Deck dan mixer dalam satu grid layout; panel Audio Output/Test Tone di bawah.
- Versi aplikasi naik ke 0.4.0 (Rust, Tauri, npm).

### Known limitations

- Headphone belum memakai stream/device kedua; cue hanya lewat channel 3/4
  perangkat multichannel atau mode split cue pada output stereo.
- Mixer baru memiliki satu channel (Deck A); crossfader penuh dan EQ per-deck B
  menyusul bersama Deck B pada Fase 5.

## [0.3.0] - 2026-11-16

### Added — Fase 3: Time-stretch, Key Lock, BPM/Key

- Time-stretch **WSOLA** stereo internal (`audio/timestretch.rs`) dengan trait
  `TimeStretcher` agar bisa diganti Signalsmith/SoundTouch; grain 2048, overlap
  Hann 50 %, pencarian korelasi ±128 frame.
- Pitch fader ±8/16/50 % dengan clamping per rentang, key lock, dan keyshift
  semitone (-12..+12). Key lock ON memakai resampler sebagai pitch-shifter +
  WSOLA; OFF memakai resampler sebagai turntable (tempo + pitch).
- Posisi deck diintegrasikan memakai speed per blok audio sehingga perubahan
  tempo tidak membuat posisi melompat; seek/load mereset seluruh state tempo.
- Analisis track satu kali decode: waveform, **BPM + beatgrid**, dan **key**
  (Krumhansl-Schmuckler + Camelot/Open Key) di thread background dengan
  pembatalan berbasis track id.
- Estimator BPM onset envelope + autokorelasi (60–200 BPM, fold 70–180),
  interpolasi parabolik, dan fase beat pertama dengan kompensasi latensi frame.
- UI Deck A: pitch fader, pilihan rentang, tombol KEY LOCK, stepper keyshift,
  BPM efektif, TAP tempo, ×2/÷2, key Camelot, dan garis beatgrid di waveform.
- Perintah IPC baru: `deck_set_speed`, `deck_set_pitch_range`,
  `deck_set_keylock`, `deck_set_semitones`, `deck_set_bpm`.
- 29 unit test Rust termasuk WSOLA (durasi & pitch), BPM click track 128/90,
  key C major/A minor, clamping speed, dan BPM override.

### Changed

- Ring buffer deck menjadi 1 detik dengan prebuffer ±0,3 detik agar perubahan
  tempo/keylock responsif; worker berhenti decode saat ruang bebas < 70 %.
- `analysis::waveform::analyze` digantikan `analysis::track::analyze` yang
  menghasilkan waveform + BPM/key dalam sekali baca file.
- Dependensi baru `rustfft` 6.4 untuk chroma/key detection.
- Versi aplikasi naik ke 0.3.0 (Rust, Tauri, npm).

### Known limitations

- Sync antar-deck belum tersedia karena masih satu deck; beat-match akan
  diselesaikan bersama Deck B pada Fase 5. BPM, tempo fader, dan key lock sudah
  menjadi fondasinya.
- Perubahan tempo/keylock terdengar setelah prebuffer ±0,3 detik habis; belum
  ada crossfade antara mode tempo.

## [0.2.0] - 2026-11-16

### Added — Fase 2: Decoder, Deck, dan Waveform

- Decoder streaming Symphonia 0.5 untuk MP3, FLAC, WAV, OGG/Vorbis, AAC/M4A,
  AIFF, dan ALAC dengan seek akurat serta deteksi end-of-stream.
- Resampler cubic Catmull-Rom (44.1/48/96 kHz → sample rate engine) dengan
  state antar-chunk, berjalan di worker thread.
- Deck worker thread: prebuffer 3 detik ke ring buffer `rtrb` lock-free,
  decode → stereo → resample → ring, plus command load/seek/cue/unload.
- Transport real-time di callback: play/pause, seek dengan epoch handshake
  (buang buffer lama tanpa lock), cue jump gaya CDJ, auto-stop di EOF,
  gain smoothing, underrun counter, dan posisi sampel-akurat.
- Waveform analysis: min/max 120 bucket/detik, downsampling aman untuk IPC,
  pembatalan otomatis saat track diganti, dan koreksi durasi dari hasil decode.
- Waveform Canvas 2D: overview, playhead, marker cue, drag-to-seek, navigasi
  keyboard (←/→), dan indikator progres.
- Deck A UI: muat file via dialog native, drag & drop dari OS, info codec/rate,
  tombol CUE/PLAY/SET CUE, ±10 detik, gain fader, meter, dan statistik buffer.
- Shortcut Space untuk play/pause (mapping lengkap menyusul Fase 9).
- Perintah IPC baru: `load_track`, `get_deck_status`, `deck_play`,
  `deck_pause`, `deck_seek`, `deck_set_cue`, `deck_cue_jump`, `deck_set_gain`,
  `deck_unload`, `get_waveform`.
- Plugin `tauri-plugin-dialog` + izin `dialog:default` untuk pemilih file.
- 16 unit test Rust (decoder WAV, seek, resampler, waveform, transport deck,
  gain, engine) yang juga dijalankan tanpa perangkat audio.

### Changed

- Engine sekarang mencampur deck + test tone melalui soft-clip master yang sama;
  test tone tetap tersedia sebagai diagnostik.
- Helper gain dB dipindah ke `audio/gain.rs` agar dipakai deck dan engine.
- Versi aplikasi naik ke 0.2.0 (Rust, Tauri, npm).

## [0.1.0] - 2026-11-16

### Added — Fase 1: Scaffold, IPC, dan Audio I/O

- Scaffold Tauri 2 + React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Zustand.
- Shell UI bertema hardware DJ (gelap, aksen cyan/magenta) dengan header status
  engine, panel Audio Output, panel Test Tone, dan roadmap 12 fase.
- Enumerasi perangkat output CPAL beserta kapabilitas: channel maksimum, sample
  rate yang didukung, format sample, dan rentang buffer.
- Pemilihan perangkat, buffer (64/128/256/512/1024 frame atau Auto), dan sample
  rate (Auto atau nilai yang didukung perangkat).
- Audio host thread pemilik `cpal::Stream` dengan lifecycle aman dan error
  terstruktur (`thiserror`), tanpa `unsafe`.
- Callback audio real-time safe: generator sine dengan phase accumulator,
  smoothing gain 5 ms (anti-klik), soft-clip kubik, dan tanpa alokasi/lock/I/O.
- Parameter tone dikirim lewat atomic (f32 bits) dan meter peak lock-free.
- Statistik callback: jumlah callback, frame, waktu proses terakhir/maksimum,
  beban periode buffer, dan penghitung xrun/error.
- DTO IPC typed (serde camelCase) + wrapper TypeScript `src/lib/ipc.ts`.
- Ikon aplikasi vektor dan turunannya (PNG, ICO, ICNS).
- Dokumentasi: `docs/ARSITEKTUR.md`, `docs/BUILD_PER_OS.md`, README, LICENSE.
- Unit test engine: konversi dB, soft clip, kontinuitas oscillator, dan
  `render_block` (peak, callback counter, frame counter).

### Known limitations

- Belum ada decoder/deck/mixer; hanya test tone ke output master.
- Limiter master penuh, cue bus, dan routing multichannel menyusul di Fase 4.
- `bundle` untuk macOS belum memuat entitlements/notarization (Fase 12).

# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/) dan
[Semantic Versioning](https://semver.org/).

## [0.11.0] - 2026-11-17

### Added — Fase 11: Modul Rekaman Mix Master & Live Streaming Broadcast (Recording & Broadcast)

- **Perekam Audio Master Mix Tanpa Beban Real-Time (`src-tauri/src/audio/recorder.rs`)**:
  - Penangkapan sampel stereo murni dari mix bus utama secara lock-free di thread RT audio melalui SPSC ring buffer (`rtrb`, 131.072 frames).
  - Tanpa alokasi memori, tanpa mutex blocking, dan tanpa syscall disk I/O di dalam thread callback audio.
  - Background writer thread berdedikasi menggunakan `hound` dengan penulisan ber-buffer efisien.
  - Dukungan 3 format kualitas WAV:
    - `WAV 16-bit Linear PCM`: Kualitas standar CD audio tanpa kompresi.
    - `WAV 24-bit Linear PCM`: Kualitas rekaman studio profesional resolusi tinggi.
    - `WAV 32-bit IEEE Floating Point`: Rentang dinamis tak terbatas, anti distorsi clipping.
  - Fitur jeda dan lanjut rekaman (*Pause & Resume*) secara instan.
  - Fitur *Split Track* instan: pembagian berkas rekaman otomatis (`_part01.wav`, `_part02.wav`, dst.) tanpa kehilangan satu sampel audio pun.
- **Klien Siaran Langsung (Live Streaming Broadcast Client) (`src-tauri/src/audio/broadcast.rs`)**:
  - Klien siaran live terintegrasi untuk server **Icecast 2** dan **SHOUTcast**.
  - Handshake protokol `SOURCE` HTTP 1.0 dengan enkripsi autentikasi mandiri HTTP Basic Base64 murni tanpa dependensi eksternal.
  - Metadata siaran lengkap: nama stasiun (`ice-name`), genre (`ice-genre`), deskripsi siaran (`ice-description`), bitrate (`ice-bitrate`), info audio samplerate & channel, dan direktori publik (`ice-public`).
  - Streaming chunk audio PCM berlatensi rendah secara kontinu via soket TCP non-blocking.
  - Proteksi otomatis terhadap pemutusan koneksi atau server overload dengan pencatatan kesalahan real-time.
- **Integrasi Penuh ke Audio Engine (`src-tauri/src/audio/engine.rs`)**:
  - Produser `RecorderProducer` dan `BroadcastProducer` disematkan langsung di loop pemrosesan blok master stereo `render_block`.
  - Rekaman dan siaran mengambil master bus murni (`soft_clip(mix.master_l/r)`) terpisah dari saluran split-cue headphone DJ, sehingga audio rekaman dan streaming tidak terkontaminasi oleh audio headphone cue DJ.
- **Komunikasi IPC Tauri & State Manager (`src-tauri/src/state.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`)**:
  - 9 command Tauri baru: `start_recording`, `stop_recording`, `pause_recording`, `resume_recording`, `split_recording`, `get_recorder_status`, `start_broadcast`, `stop_broadcast`, dan `get_broadcast_status`.
  - Otomatisasi direktori penyimpanan rekaman (`~/Music/DJDeX Recordings` atau konfigurasi custom path).
- **Antarmuka Pengguna React & Zustand Store (`src/stores/recordStore.ts`, `src/components/RecordPanel.tsx`)**:
  - Store Zustand reaktif untuk memantau status perekaman, durasi waktu berjalan, byte terkirim, dan level VU meter secara real-time.
  - Tab *Master Mix Recorder*:
    - Tombol rekam besar warna merah dengan animasi pulsa menyala saat aktif.
    - Timer durasi rekaman besar monospace (`00:00:00`), indikator bagian rekaman (*Part X*), dan penghitung ukuran berkas live (MB).
    - Stereo VU Meter animasi responsif (L & R) dengan gradient hijau, kuning, hingga merah.
    - Kontrol jeda/lanjut (*Pause/Resume*) dan tombol *Split Track*.
    - Selektor format berkas WAV 16-bit / 24-bit / 32-bit Float serta input path kustom.
  - Tab *Live Streaming Broadcast*:
    - Status badge interaktif: "SIARAN LANGSUNG ON AIR" hijau berkedip saat terhubung.
    - Penghitung waktu siaran on-air dan jumlah data audio yang telah dialirkan (MB sent).
    - Formulir konfigurasi server lengkap: Protokol (Icecast2 / SHOUTcast), Alamat Host:Port, Mount Point, Password (dengan toggle tampilkan/sembunyikan), Bitrate (128 - 320 kbps), Nama Stasiun, Genre, dan Deskripsi.
    - Tombol "Mulai Siaran (Go Live)" dan "Akhiri Siaran (Disconnect)".
  - Bilah Status Header (`src/components/Header.tsx`):
    - Badge indikator *REC* merah berkedip saat merekam dan *ON AIR* hijau saat streaming langsung.
- **Unit Test Komprehensif**:
  - Pengujian workflow perekam WAV 16-bit, pause, resume, dan validasi header WAV via `hound`.
  - Pengujian transisi tanpa jeda *Split Track* ke berkas part berikutnya.
  - Pengujian fungsi encoding Base64 RFC 4648.
  - Pengujian siklus inisialisasi controller dan isolasi buffer audio RT.
  - Total unit test Rust kini mencapai 82 test dan seluruhnya lulus 100%.

### Changed

- Versi aplikasi dinaikkan ke `0.11.0` (Rust `Cargo.toml`, `tauri.conf.json`, `package.json`, `App.tsx`, dan UI header/footer).
- Ditambahkan tab panel bawah "Record & Live Broadcast" dengan aksen merah neon di `App.tsx`.

## [0.11.0] - 2026-11-17

### Fixed — Audio engine & ALSA

- **Perbaikan `ALSA lib pcm_route.c:886 find_matching_chmap: Found no matching channel map`**: pemilihan konfigurasi stream tidak lagi memakai `default_output_config()` mentah-mentah. Engine sekarang membangun daftar kandidat dari `supported_output_configs()` (hanya format f32/i16/u16 dan channel count yang benar-benar diekspos driver), lalu mencoba berurutan: pilihan pengguna → stereo → default perangkat → mono. Stereo selalu tersedia sebagai fallback sehingga permintaan channel tanpa channel map tidak lagi menggagalkan inisialisasi.
- Buffer di luar rentang driver sekarang di-clamp ke batas min/max, bukan ditolak. Sample rate dan channel yang tidak didukung otomatis jatuh ke konfigurasi terdekat yang valid.
- Pesan error pembukaan stream menyebut kanal map ALSA dan langkah perbaikannya (pilih stereo, split cue, atau perangkat 4 channel).
- `AudioDeviceInfo` mengekspos `supportedChannels`; panel Audio Output menambahkan pilihan **Channel output** (auto/stereo/4 channel) dan hanya menampilkan channel yang didukung perangkat.

### Added — Inisialisasi engine & antarmuka

- Engine audio (serta subsistem library, MIDI, skin, sampler, recorder) diinisialisasi otomatis saat aplikasi dibuka lewat `ensureEngine` yang idempoten; pengguna tidak perlu menekan tombol untuk mulai bersuara.
- Panel **Record & Live Broadcast** kini dapat diakses dari navigasi tab bawah (sebelumnya komponen sudah ada tetapi tidak pernah dirender).
- `Panel` menerima warna aksen skin per panel (deck A/B, mixer).

### Changed — Skin & Layout Engine benar-benar fungsional

- Variabel `--skin-*` sekarang dipakai oleh stylesheet: latar aplikasi, permukaan panel, border, teks, chip, tombol primer, fader, dan fokus mengikuti tema aktif. Sebelumnya variabel di-inject tetapi tidak dikonsumsi CSS, sehingga semua skin tampak sama.
- Layout skin kini mengubah UI nyata: aksen deck dan palet hot cue, ukuran/tekstur/center platter, orientasi horizontal/vertikal waveform, tinggi waveform, beatgrid on/off, scratch pads, posisi mixer tengah vs compact-bottom, panel bawah awal, dan phase strip.
- `Waveform` mendukung mode vertikal (alur waktu atas–bawah, drag-to-seek vertikal) dengan warna aksen skin.
- Template keempat diubah dari "Four-Deck Pro" yang belum didukung engine menjadi **"Tour Pro"** (id `tour-pro`): dua deck, waveform lebar 164 px, platter standard, palet empat aksen, phase strip aktif. Empat template kini berbeda secara visual dan struktural serta jujur terhadap kemampuan engine.
- Versi aplikasi dinaikkan ke `0.11.0` (Rust, Tauri, npm, footer, header).

### Docs

- README ditulis ulang sesuai status Fase 11: kemampuan nyata, tabel stack, cara pakai, troubleshooting ALSA, spesifikasi skin, struktur proyek, dan roadmap 11/12.
- `docs/BUILD_PER_OS.md` menambahkan bagian troubleshooting ALSA (`find_matching_chmap`).
- `docs/ARSITEKTUR.md` diperbarui ke status implementasi Fase 11.
- PhaseStrip di UI menandai Fase 7–11 selesai dan Fase 12 sebagai berikutnya.
- 2 unit test baru untuk preferensi channel/fallback stereo dan pesan bantuan ALSA; total **84 unit test Rust**.

## [0.10.0] - 2026-11-17

### Added — Fase 10: Sistem Template / Skin "Mesin Tampilan DJ Virtual"

- **Skin & Layout Engine Rust (`src-tauri/src/skin/`)**:
  - `manifest.rs`: Skema dokumen manifest skin komprehensif (`SkinManifest`) dengan dukungan format ganda JSON (`serde_json`) dan TOML (`toml 0.8`).
  - Definisi gaya piringan `PlatterStyle` (`size`: `compact` | `standard` | `large-battle`, `vinyl_texture`, `center_display`).
  - Definisi tata letak gelombang suara `WaveformLayout` (`position`: `top-stacked` | `deck-integrated` | `bottom` | `hidden`, `orientation`: `horizontal` | `vertical`, `height_px`, `show_beatgrid`).
  - Definisi mixer `MixerLayout` (`position`: `center` | `compact-bottom` | `split`, `channel_count`: 2 atau 4, `vu_meter_style`: `segmented` | `analog` | `gradient`, `crossfader_height_px`).
  - Skema warna tema fleksibel `SkinTheme` (primary accent, accent Deck A, B, C, D, background, surface, panel border, text, font family, serta injeksi custom CSS dinamis).
- **4 Template Pabrikan Bawaan (Factory Skins)**:
  1. *Classic Club (`skins/classic-club/skin.json`)*: Tata letak standar club CDJ + DJM, 2 deck, waveform horizontal bertumpuk di bagian atas, mixer 2 channel di tengah dengan aksen sian neon dan magenta.
  2. *Battle Scratch (`skins/battle-scratch/skin.json`)*: Tata letak khusus turntablist / DJ battle dengan piringan vinyl ekstra besar (12-inch turntable), waveform vertikal berdampingan di dalam deck, crossfader dominan, tombol scratch pads, dan tema dark carbon & gold/crimson.
  3. *Producer Remix (`skins/producer-remix/skin.json`)*: Tata letak live remixer dengan deck kompak, mixer ringkas, serta sorotan utama pada Remixer Sampler 16-Pad dan 16-Step Sequencer dengan tema electric purple & neon pink.
  4. *Four-Deck Pro (`skins/four-deck-pro/skin.json`)*: Tata letak 4 deck workstation (Deck A & C di sisi kiri, Deck B & D di sisi kanan) dengan mixer 4 channel lengkap serta aksen sky blue, vivid orange, emerald, dan rose.
- **Pengelola Pemuatan & Ekspor/Impor Skin (`src-tauri/src/skin/loader.rs`)**:
  - Pemindaian folder skin kustom otomatis dari folder data aplikasi (`skins/`).
  - Pengalihan skin aktif secara real-time tanpa perlu me-restart audio engine.
  - Fitur ekspor paket skin menjadi arsip zip mandiri `.djdex-skin` (berisi `skin.json` dan `skin.toml`).
  - Fitur impor paket `.djdex-skin` dengan validasi manifest dan penamaan unik otomatis jika ada benturan ID dengan template pabrikan.
- **Antarmuka Pengguna React & Zustand Store (`src/stores/skinStore.ts`, `src/components/SkinPanel.tsx`)**:
  - Injeksi variabel CSS dinamis (`--skin-primary`, `--skin-accent-a`, `--skin-accent-b`, `--skin-bg`, `--skin-surface`, `--skin-border`, `--skin-text`) langsung ke root document DOM.
  - *Galeri Template*: Kartu visual untuk setiap skin dengan lencana aktif, pratinjau palet warna, badge jumlah deck, orientasi waveform, dan tombol "Terapkan Skin".
  - *Editor Visual & Tata Letak*: Formulir interaktif untuk mengubah warna tema secara langsung (color picker), memilih orientasi waveform (horizontal vs vertikal), ukuran piringan vinyl, jumlah deck, dan opsi tampilan.
  - *Quick Skin Switcher di Header (`src/components/Header.tsx`)*: Dropdown di bilah navigasi atas untuk berganti tampilan secara instan dengan 1 klik.
  - *Ekspor / Impor Native*: Terhubung dengan dialog native OS untuk menyimpan dan membuka file `.djdex-skin`.
- **6 Unit Test Baru di Rust**:
  - Inisialisasi dan verifikasi 4 factory skins.
  - Roundtrip serialisasi dan parsing JSON manifest.
  - Roundtrip serialisasi dan parsing TOML manifest.
  - Pengalihan skin aktif di `SkinManager`.
  - Penyimpanan dan penghapusan skin kustom.
  - Siklus penuh ekspor dan impor arsip zip paket `.djdex-skin`. Total unit test Rust kini mencapai 78 test lulus 100%.

### Changed

- Versi aplikasi dinaikkan ke `0.10.0` (Rust `Cargo.toml`, `tauri.conf.json`, `package.json`, `App.tsx`, dan UI header/footer).
- Ditambahkan dependensi `toml = "0.8"` ke `src-tauri/Cargo.toml`.
- Navigasi panel bawah di `App.tsx` ditambahkan tab "Skins & Layout" dengan lencana sky blue.

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

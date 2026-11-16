# Build & Packaging per OS

Panduan ini mencakup kebutuhan **development** dan catatan **packaging**.
Perintah packaging lengkap (msi/nsis, dmg, deb/rpm/AppImage/Flatpak, CI/CD)
dituntaskan pada Fase 12; dokumen ini sudah memuat prasyarat yang harus ada
sejak awal.

## Prasyarat umum

- Rust stable terbaru (`rustup update stable`)
- Node.js ≥ 20.19 dan npm
- Tauri CLI (sudah tersedia lewat `@tauri-apps/cli` di devDependencies)

```bash
npm install
npm run tauri dev     # dev
npm run tauri build   # bundle
```

## Windows 10/11 (x64)

1. **Visual Studio Build Tools** dengan workload *Desktop development with C++*
   (MSVC linker + Windows SDK).
2. **WebView2 Runtime** (sudah terpasang default di Windows 11; Windows 10 bisa
   memakai Evergreen Bootstrapper).
3. Rust target default: `x86_64-pc-windows-msvc`.

```powershell
npm install
npm run tauri build
```

Menghasilkan installer MSI dan NSIS (`target/release/bundle/msi`,
`target/release/bundle/nsis`). Konfigurasi target ada di
`src-tauri/tauri.conf.json` (`bundle.targets: "all"`).

### ASIO (opsional)

Feature `asio` sudah disiapkan di `src-tauri/Cargo.toml`, tetapi butuh:

- ASIO SDK (Steinberg) di `ASIO_SDK_DIR`
- build dengan `cargo build --features asio` / sesuaikan `beforeBuildCommand`
- driver ASIO yang terpasang di sistem

Tanpa itu, WASAPI exclusive/shared tetap dipakai lewat CPAL.

### Windows ARM64 (opsional)

```powershell
rustup target add aarch64-pc-windows-msvc
npm run tauri build -- --target aarch64-pc-windows-msvc
```

## macOS (Intel + Apple Silicon)

1. Xcode Command Line Tools: `xcode-select --install`
2. Target universal:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

Output: `.app` dan `.dmg` di `target/universal-apple-darwin/release/bundle/`.

- **Entitlements** mikrofon/audio dan signing disiapkan pada Fase 12
  (`src-tauri/Entitlements.plist` + `signingIdentity`).
- Notarization memerlukan Apple Developer ID; dokumentasi langkah `notarytool`
  ditambahkan bersama workflow CI.

## Ubuntu / Debian

Dependensi (Ubuntu 22.04/24.04/26.04 dan Debian 12+):

```bash
sudo apt update
sudo apt install -y \
  build-essential curl wget file pkg-config \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libxdo-dev \
  libasound2-dev libjack-jackd2-dev
```

- `libasound2-dev` wajib untuk CPAL (ALSA). PipeWire dan PulseAudio bekerja
  melalui ALSA/PipeWire-ALSA bridge.
- JACK opsional; CPAL memakai host default sistem.
- Jalankan `npm run tauri dev` setelah dependensi terpasang.

Hasil `npm run tauri build`: `.deb`, `.rpm` (bila tooling tersedia), dan
AppImage di `src-tauri/target/release/bundle/`.

## Fedora / RHEL / openSUSE

```bash
sudo dnf install -y \
  gcc gcc-c++ make pkgconf-pkg-config \
  webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel \
  librsvg2-devel openssl-devel libxdo-devel \
  alsa-lib-devel jack-audio-connection-kit-devel
```

```bash
npm install
npm run tauri build
```

Untuk Flatpak, manifest `flatpak/` dan runtime GNOME ditambahkan pada Fase 12.

## CI/CD (Fase 12)

Rencana matrix GitHub Actions:

- `windows-latest` → MSI + NSIS
- `macos-latest` → universal DMG (signing + notarization)
- `ubuntu-22.04` → DEB + AppImage
- container Fedora → RPM
- artefak diunggah per tag; updater memakai `tauri-plugin-updater`

## Troubleshooting

| Gejala | Penyebab / solusi |
| --- | --- |
| `alsa-sys` gagal: `pkg-config` tidak menemukan `alsa` | install `libasound2-dev` / `alsa-lib-devel`, pastikan `pkg-config` ada |
| `webkit2gtk-4.1` tidak ditemukan | install `libwebkit2gtk-4.1-dev` (Ubuntu 22.04+) |
| Tidak ada device di UI | pastikan user punya akses ke device audio (`pipewire`/`pulseaudio` berjalan); cek `aplay -l` |
| Buffer ditolak | perangkat tidak mendukung ukuran tersebut; pilih Auto atau ukuran lain |
| Suara tidak keluar | cek volume OS, device default, dan sampling rate; coba 48 kHz / Auto |

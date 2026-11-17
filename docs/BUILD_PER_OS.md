# Panduan Build, Packaging, dan Distribusi per OS

Dokumen ini memuat panduan komprehensif untuk mengkompilasi, menguji, dan mempaketkan **DJDeX By Kangpcode** ke berbagai format installer native lintas platform: Windows (`.msi`, NSIS `.exe`), macOS (`.app`, `.dmg`), dan Linux (`.deb`, `.rpm`, `AppImage`, `Flatpak`).

---

## 1. Prasyarat Umum

- **Node.js**: Versi LTS modern (≥ 20.19.0).
- **Rust**: Versi stabil terbaru (≥ 1.88, edisi 2021). Pasang via `rustup`:
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  rustup update stable
  ```
- **Tauri CLI**: Sudah terpasang sebagai dependensi lokal di `package.json` (`@tauri-apps/cli`).

Instal dependensi JavaScript:
```bash
npm install
```

Jalankan server pengembangan interaktif (Hot Module Replacement + Rust backend):
```bash
npm run tauri dev
```

---

## 2. Windows 10/11 (x64 & ARM64)

### A. Prasyarat Sistem
1. Pasang **Visual Studio 2022 Community / Build Tools** dengan mencentang workload:
   - *Desktop development with C++*
   - *Windows 10/11 SDK*
2. **WebView2 Runtime** (secara default sudah ada di Windows 11; untuk Windows 10 disediakan bootstrapper otomatis oleh Tauri).

### B. Perintah Packaging
Untuk membuat installer **MSI** dan **NSIS (.exe)**:
```powershell
npm install
npm run tauri build
```

Hasil berkas installer berada di:
- `src-tauri/target/release/bundle/nsis/DJDeX_0.12.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/DJDeX_0.12.0_x64_en-US.msi`

### C. Opsi Dukungan Audio ASIO (Pro Audio Driver)
Bila ingin mengaktifkan driver ASIO berlatensi ultra-rendah (< 2 ms) di Windows:
1. Unduh **Steinberg ASIO SDK** dan atur environment variable:
   ```powershell
   $env:ASIO_SDK_DIR = "C:\SDKs\asiosdk"
   ```
2. Build dengan flag feature:
   ```powershell
   npm run tauri build -- --features asio
   ```

---

## 3. macOS (Apple Silicon & Intel)

### A. Prasyarat Sistem
1. Pasang **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```
2. Tambahkan kedua target kompilasi untuk arsitektur M1/M2/M3/M4 (ARM64) dan Intel (x86_64):
   ```bash
   rustup target add aarch64-apple-darwin x86_64-apple-darwin
   ```

### B. Perintah Packaging Universal Binary (`.dmg`)
```bash
npm install
npm run tauri build -- --target universal-apple-darwin
```

Hasil berkas installer:
- `src-tauri/target/universal-apple-darwin/release/bundle/dmg/DJDeX_0.12.0_universal.dmg`
- `src-tauri/target/universal-apple-darwin/release/bundle/macos/DJDeX.app`

### C. Izin Privasi & Entitlements macOS (`Entitlements.plist`)
DJDeX telah menyertakan `src-tauri/Entitlements.plist` untuk:
- `com.apple.security.device.audio-input`: Akses mikrofon dan line-in interface.
- `com.apple.security.cs.allow-jit`: Thread audio DSP real-time.
- `com.apple.security.network.client`: Streaming broadcast Icecast 2 & SHOUTcast.

Untuk penandatanganan sertifikat Apple Developer ID dan notarisasi resmi Apple:
```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="your.email@domain.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID"

npm run tauri build -- --target universal-apple-darwin
xcrun notarytool submit src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg \
  --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait
```

---

## 4. Linux (Ubuntu, Debian, Fedora, Arch, Flatpak)

### A. Dependensi Sistem

**Ubuntu 22.04 / 24.04 / Debian 12+**:
```bash
sudo apt update
sudo apt install -y \
  build-essential curl wget file pkg-config \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libasound2-dev libjack-jackd2-dev
```

**Fedora / RHEL / Rocky Linux**:
```bash
sudo dnf install -y \
  gcc gcc-c++ make pkgconf-pkg-config \
  webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel \
  librsvg2-devel openssl-devel alsa-lib-devel
```

### B. Perintah Packaging Linux (DEB, AppImage, RPM)
```bash
npm install
npm run tauri build
```

Hasil berkas distribusi berada di:
- `src-tauri/target/release/bundle/deb/djdex_0.12.0_amd64.deb`
- `src-tauri/target/release/bundle/appimage/djdex_0.12.0_amd64.AppImage`
- `src-tauri/target/release/bundle/rpm/djdex-0.12.0-1.x86_64.rpm`

### C. Build Paket Sandbox Flatpak
Manifest Flatpak resmi tersedia di folder `flatpak/com.kangpcode.djdex.yml`:
```bash
flatpak-builder --user --install --force-clean build-dir flatpak/com.kangpcode.djdex.yml
flatpak run com.kangpcode.djdex
```

---

## 5. Otomasi CI/CD GitHub Actions

Pipa CI/CD telah dikonfigurasi penuh di folder `.github/workflows/`:
1. **`.github/workflows/ci.yml`**:
   - Berjalan pada setiap pull request dan push ke branch `main`.
   - Menguji matrix multi-platform (`ubuntu-22.04`, `windows-latest`, `macos-latest`).
   - Menjalankan `npm run typecheck`, `npm run build`, `cargo check`, dan `cargo test` (82 unit test lulus 100%).
2. **`.github/workflows/release.yml`**:
   - Berjalan otomatis saat ada tag rilis git baru (`v*`, contoh: `v0.12.0`).
   - Mengkompilasi artefak release untuk Windows (`.msi`, `.exe`), macOS Universal (`.dmg`), dan Linux (`.deb`, `.AppImage`).
   - Mengunggah berkas binari installer secara otomatis ke GitHub Releases.

---

## 6. Tabel Solusi Masalah (Troubleshooting)

| Gejala | Penyebab | Solusi |
|---|---|---|
| `alsa-sys` error saat kompilasi di Linux | Header ALSA belum terpasang | Pasang `libasound2-dev` (Ubuntu) atau `alsa-lib-devel` (Fedora) |
| WebKitGTK tidak ditemukan | Paket webkit lama digunakan | Pastikan memasang versi 4.1: `libwebkit2gtk-4.1-dev` |
| Permintaan audio input / MIC ditolak di macOS | Belum diberi hak akses privasi | Izinkan akses mikrofon di *System Settings -> Privacy & Security -> Microphone* |
| XRun / Glitch audio pada sistem dengan beban berat | Buffer audio terlalu kecil | Buka panel *Audio Output*, naikkan buffer frames dari 128 ke 256 atau 512 frame |
| Sambungan Icecast ditolak (HTTP 401/404) | Mount point atau password keliru | Pastikan format mount memakai tanda slash (contoh: `/live`) dan password cocok dengan `icecast.xml` |

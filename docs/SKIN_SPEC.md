# Spesifikasi Template & Skin Engine DJDeX

Dokumen ini mendefinisikan format dokumen manifest template/skin, struktur paket berkas `.djdex-skin`, sistem palet tema warna, dan hierarki tata letak antarmuka DJDeX.

---

## 1. Ikhtisar Format Berkas

DJDeX mendukung dua format manifes teks yang ekuivalen:
- `skin.json` (Format standar JSON berbasis ECMAScript)
- `skin.toml` (Format konfigurasi minimalis TOML v0.8)

Paket distribusi skin portabel dibungkus dalam bentuk arsip ZIP berformat ekstensi `.djdex-skin`.

### Struktur Arsip `.djdex-skin`

```text
my-custom-theme.djdex-skin (ZIP archive)
├── skin.json             (Wajib: dokumen manifest format JSON)
├── skin.toml             (Opsional: dokumen manifest format TOML)
├── preview.png           (Opsional: tangkapan layar pratinjau tema)
└── assets/               (Opsional: gambar tekstur vinyl atau ikon khusus)
```

---

## 2. Skema Dokumen Manifest

```json
{
  "metadata": {
    "id": "classic-club",
    "name": "Classic Club",
    "author": "Kangpcode",
    "version": "1.0.0",
    "description": "Tata letak standar klub profesional: 2 CDJ deck, mixer 2 channel di tengah, dan waveform bertumpuk."
  },
  "theme": {
    "primaryColor": "#00e5ff",
    "accentDeckA": "#00e5ff",
    "accentDeckB": "#ff007f",
    "accentDeckC": "#10b981",
    "accentDeckD": "#f59e0b",
    "backgroundColor": "#090d16",
    "surfaceColor": "#0e1526",
    "panelBorderColor": "#1c2842",
    "textColor": "#f1f5f9",
    "fontFamily": "Inter, sans-serif",
    "customCss": null
  },
  "layout": {
    "deckCount": 2,
    "waveform": {
      "position": "top-stacked",
      "orientation": "horizontal",
      "heightPx": 110,
      "showBeatgrid": true
    },
    "platter": {
      "size": "standard",
      "vinylTexture": true,
      "centerDisplay": true
    },
    "mixer": {
      "position": "center",
      "channelCount": 2,
      "vuMeterStyle": "segmented",
      "crossfaderHeightPx": 56
    },
    "showPhaseStrip": false,
    "showScratchPads": false
  }
}
```

---

## 3. Opsi Tata Letak (Layout Options)

### A. Piringan Virtual (Platter Style)
- `size`:
  - `"compact"`: Ukuran ringkas untuk mode kontroler mobile atau layar resolusi rendah.
  - `"standard"`: Diameter standar sebanding piringan CDJ 2000 / CDJ 3000.
  - `"large-battle"`: Diameter piringan ekstra besar 12-inci vinyl khusus turntablist dan pertunjukan scratch.
- `vinylTexture`: `true` (tekstur alur vinyl mikro) atau `false` (permukaan CDJ metalik).
- `centerDisplay`: `true` (menampilkan BPM, durasi elapsed/remaining, dan posisi jarum di tengah piringan).

### B. Gelombang Suara (Waveform Layout)
- `position`:
  - `"top-stacked"`: Bertumpuk di bagian atas mixer untuk memudahkan perbandingan beat-matching antar deck.
  - `"deck-integrated"`: Gelombang suara berada langsung di dalam panel masing-masing deck.
  - `"bottom"`: Waveform di bawah mixer.
  - `"hidden"`: Gelombang suara disembunyikan.
- `orientation`:
  - `"horizontal"`: Gelombang suara bergerak mengalir dari kanan ke kiri.
  - `"vertical"`: Gelombang suara bergerak mengalir dari atas ke bawah (gaya Serato / Traktor Battle).
- `heightPx`: Tinggi kanvas gelombang suara dalam piksel (default: 110 px).
- `showBeatgrid`: Tampilkan garis ketukan vertikal dan penanda birama.

### C. Mixer Audio (Mixer Layout)
- `position`: `"center"` (di antara deck kiri dan kanan) atau `"compact-bottom"`.
- `channelCount`: 2 atau 4 channel.
- `vuMeterStyle`:
  - `"segmented"`: Indikator LED bersegmen klasik (hijau, kuning, merah).
  - `"analog"`: Jarum VU analog balistik jarum VU meter.
  - `"gradient"`: Bar gradien halus modern.

---

## 4. Variabel CSS yang Diinjeksikan (Theme Engine)

Saat skin dimuat di frontend, `SkinManager` secara otomatis menginjeksi variabel warna CSS berikut ke `:root`:

| Variabel CSS | Properti Tema | Penggunaan |
|---|---|---|
| `--skin-primary` | `primaryColor` | Warna tombol utama, playhead, dan glow seleksi |
| `--skin-accent-a` | `accentDeckA` | Aksen warna Deck A dan Deck C (misal: Sian Neon `#00e5ff`) |
| `--skin-accent-b` | `accentDeckB` | Aksen warna Deck B dan Deck D (misal: Magenta `#ff007f`) |
| `--skin-bg` | `backgroundColor` | Latar belakang dasar jendela workstation |
| `--skin-surface` | `surfaceColor` | Permukaan panel modul deck, mixer, dan sampler |
| `--skin-border` | `panelBorderColor` | Garis tepi panel dan pemisah modul |
| `--skin-text` | `textColor` | Teks judul, pembacaan BPM, dan angka durasi |

---

## 5. Empat Template Pabrikan Bawaan (Factory Skins)

1. **Classic Club (`skins/classic-club/skin.json`)**:
   Tata letak klub standar industri. 2 CDJ deck, mixer 2 channel di tengah, waveform horizontal bertumpuk di atas mixer, aksen neon cyan dan magenta.
2. **Battle Scratch (`skins/battle-scratch/skin.json`)**:
   Tata letak khusus turntablist. Platter 12-inci besar dengan alur vinyl tebal, waveform vertikal terintegrasi, crossfader dominan responsif, dan tombol scratch pads.
3. **Producer Remix (`skins/producer-remix/skin.json`)**:
   Tata letak studio remix dan live production. Deck kompak, mixer ringkas, dengan fokus utama pada Remixer Sampler 16-Pad dan Step Sequencer drum machine.
4. **Four-Deck Pro (`skins/four-deck-pro/skin.json`)**:
   Workstation 4-deck lengkap (Deck A & C di kiri, Deck B & D di kanan) dengan mixer 4 channel dan kontrol PFL individual.

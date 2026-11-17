# Panduan Integrasi Hardware MIDI & Pemetaan Kontroler

DJDeX dilengkapi dengan subsistem MIDI lintas platform berbasis `midir` yang mendukung deteksi plug-and-play perangkat keras DJ, pemetaan tombol/knob interaktif (**MIDI Learn**), decoding jog wheel putar relatif, dan umpan balik LED hardware.

---

## 1. Arsitektur Komunikasi MIDI

```text
[Hardware DJ Controller] (USB MIDI)
           │
           ▼
     midir Callback (Thread Worker Non-Blocking, < 1ms)
           │
           ├─► Parser Pesan Biner MIDI (NoteOn, NoteOff, CC, PitchBend)
           │
           ├─► Jog Wheel Decoder (RelativeTwoComp / BinaryOffset / SignedBit)
           │
           ▼
    Dispatch ke AudioEngine RT (Atomic / Lock-Free Command Queue)
           │
           ▼
    Audio Engine Output (Playback, Scratch, EQ, Filter, Volume)
```

---

## 2. Decoding Jog Wheel Hardware DJ

DJ controller di pasaran mengirimkan data putaran jog wheel dalam bentuk sinyal perubahan relatif (incremental delta). DJDeX mendukung 4 standar industri:

| Mode | Format Nilai CC | Contoh Perangkat DJ |
|---|---|---|
| `RelativeTwoComp` | Nilai 1..63 = maju (searah jarum jam), Nilai 127..65 = mundur | Pioneer DJ (DDJ-400, DDJ-FLX4, DDJ-SB3, DDJ-1000) |
| `RelativeBinaryOffset` | Nilai 65..127 = maju, Nilai 63..0 = mundur (center 64) | Native Instruments (Traktor Kontrol S2/S4), Numark Mixtrack |
| `RelativeSignedBit` | Bit ke-6 sebagai tanda arah: 0..63 maju, 64..127 mundur | Hercules DJControl Inpulse 200/300/500 |
| `Absolute` | 0..127 nilai absolut | Mixer volume fader, knob pitch fader |

---

## 3. Fitur Interaktif MIDI Learn

1. Buka tab **MIDI & Keyboard Mapping** di panel bawah aplikasi.
2. Klik tombol **MIDI Learn** pada aksi yang ingin Anda petakan (misalnya: *Deck A Play/Pause*, *Mixer Crossfader*, atau *Deck B Hot Cue 1*).
3. Gerakkan atau tekan tombol/knob/fader fisik pada kontroler DJ Anda.
4. DJDeX secara otomatis mendeteksi nomor channel, message type (Note On atau Control Change), dan nomor kontroler (CC index).
5. Pemetaan langsung aktif secara instan dan dapat disimpan ke berkas preset JSON.

---

## 4. Struktur Berkas Preset Pemetaan MIDI (`.json`)

Berkas preset pemetaan kontroler disimpan di direktori data aplikasi (`~/.local/share/djdex/presets/` pada Linux atau `%APPDATA%\djdex\presets\` pada Windows):

```json
{
  "name": "Pioneer DDJ-FLX4",
  "author": "Kangpcode",
  "deviceMatch": "DDJ-FLX4",
  "mappings": [
    {
      "id": "deck_a_play",
      "channel": 0,
      "messageType": "noteOn",
      "control": 11,
      "action": { "type": "deckPlay", "payload": { "deck": 0 } },
      "description": "Deck A Play/Pause toggle"
    },
    {
      "id": "deck_a_cue",
      "channel": 0,
      "messageType": "noteOn",
      "control": 12,
      "action": { "type": "deckCue", "payload": { "deck": 0 } },
      "description": "Deck A Cue Return"
    },
    {
      "id": "crossfader",
      "channel": 0,
      "messageType": "controlChange",
      "control": 8,
      "action": { "type": "mixerCrossfader" },
      "description": "Mixer Crossfader Curve"
    }
  ]
}
```

---

## 5. Pintasan Keyboard Bawaan (Default Keyboard Shortcuts)

Jika Anda belum memiliki kontroler MIDI fisik, seluruh fungsi workstation dapat dikendalikan penuh menggunakan keyboard komputer:

| Tombol | Fungsi Workstation |
|---|---|
| `Space` | Play / Pause Deck A |
| `Shift + Space` | Play / Pause Deck B |
| `C` | Set / Jump Cue Point Deck A |
| `V` | Set / Jump Cue Point Deck B |
| `S` | Sinkronkan BPM Deck B ke Deck A (Sync) |
| `1` .. `4` | Trigger Hot Cue 1–4 Deck A |
| `5` .. `8` | Trigger Hot Cue 1–4 Deck B |
| `Q` / `W` | Pitch Bend Turun / Naik Deck A |
| `O` / `P` | Pitch Bend Turun / Naik Deck B |
| `Left Arrow` | Geser Crossfader ke Kiri (Deck A) |
| `Right Arrow` | Geser Crossfader ke Kanan (Deck B) |
| `Down Arrow` | Kembalikan Crossfader ke Tengah |

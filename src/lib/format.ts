/** Helper format angka untuk readout audio. */

export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) {
    return "—";
  }
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 1 : 2)} kHz`;
  }
  return `${hz.toFixed(hz < 100 ? 1 : 0)} Hz`;
}

export function formatDb(db: number): string {
  if (!Number.isFinite(db)) {
    return "—";
  }
  const sign = db > 0 ? "+" : "";
  return `${sign}${db.toFixed(1)} dB`;
}

export function formatMs(ms: number | null | undefined): string {
  return ms == null ? "—" : `${ms.toFixed(1)} ms`;
}

export function formatInt(value: number | null | undefined): string {
  if (value == null) {
    return "—";
  }
  return new Intl.NumberFormat("id-ID").format(value);
}

/** Peak linear (0..1+) -> dBFS, dibatasi di -60 dB untuk meter. */
export function peakToDb(peak: number): number {
  if (!Number.isFinite(peak) || peak <= 1e-6) {
    return -60;
  }
  return Math.max(-60, 20 * Math.log10(peak));
}

/** Format waktu deck: `m:ss.d` (atau `h:mm:ss` untuk track panjang). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00.0";
  }

  const total = Math.floor(seconds * 10) / 10;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secs
      .toFixed(1)
      .padStart(4, "0")}`;
  }

  return `${minutes}:${secs.toFixed(1).padStart(4, "0")}`;
}

/** Rasio tempo (1.0 = normal) -> `+3.2 %`. */
export function formatPitchPercent(speed: number): string {
  if (!Number.isFinite(speed)) {
    return "—";
  }
  const percent = (speed - 1) * 100;
  const sign = percent > 0.05 ? "+" : "";
  return `${sign}${percent.toFixed(1)} %`;
}

export function formatSemitones(semitones: number): string {
  if (!Number.isFinite(semitones)) {
    return "—";
  }
  const sign = semitones > 0 ? "+" : "";
  return `${sign}${semitones.toFixed(0)} st`;
}

export function formatBpm(bpm: number): string {
  return Number.isFinite(bpm) && bpm > 0 ? bpm.toFixed(2) : "—";
}

export function formatSampleRate(rate: number | null | undefined): string {
  return rate ? `${(rate / 1000).toFixed(rate % 1000 === 0 ? 1 : 2)} kHz` : "—";
}

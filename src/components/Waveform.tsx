import { useEffect, useRef, useState } from "react";

export type WaveformOrientation = "horizontal" | "vertical";

interface WaveformProps {
  /** Pasangan min/max diratakan. */
  peaks: number[];
  duration: number;
  position: number;
  cue: number;
  /** BPM untuk garis beatgrid; 0 = belum terdeteksi. */
  bpm: number;
  /** Waktu beat pertama (detik). */
  firstBeat: number;
  enabled: boolean;
  /** Arah alur waktu; skin "Battle Scratch" memakai vertikal. */
  orientation?: WaveformOrientation;
  showBeatgrid?: boolean;
  /** Warna aksen dari skin aktif. */
  accent?: string;
  onSeek: (seconds: number) => void;
}

interface CanvasSize {
  width: number;
  height: number;
}

const FALLBACK_ACCENT = "#67e8f9";

function normalizeHex(value: string | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : FALLBACK_ACCENT;
}

function rgba(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function Waveform({
  peaks,
  duration,
  position,
  cue,
  bpm,
  firstBeat,
  enabled,
  orientation = "horizontal",
  showBeatgrid = true,
  accent,
  onSeek,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) {
      return;
    }

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.width * ratio);
    canvas.height = Math.floor(size.height * ratio);

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawWaveform(
      context,
      size.width,
      size.height,
      peaks,
      duration,
      dragSeconds ?? position,
      cue,
      bpm,
      firstBeat,
      orientation,
      showBeatgrid,
      accent,
    );
  }, [
    peaks,
    size,
    duration,
    position,
    cue,
    bpm,
    firstBeat,
    dragSeconds,
    orientation,
    showBeatgrid,
    accent,
  ]);

  const timeAt = (
    clientX: number,
    clientY: number,
    element: HTMLCanvasElement,
  ) => {
    const rect = element.getBoundingClientRect();
    const fraction =
      orientation === "vertical"
        ? rect.height > 0
          ? (clientY - rect.top) / rect.height
          : 0
        : rect.width > 0
          ? (clientX - rect.left) / rect.width
          : 0;
    return Math.min(Math.max(fraction, 0), 1) * duration;
  };

  return (
    <canvas
      ref={canvasRef}
      role="slider"
      aria-label="Posisi track"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      tabIndex={0}
      className="block h-full w-full cursor-crosshair touch-none select-none outline-none"
      onPointerDown={(event) => {
        if (!enabled || duration <= 0) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragSeconds(
          timeAt(event.clientX, event.clientY, event.currentTarget),
        );
      }}
      onPointerMove={(event) => {
        if (dragSeconds == null) {
          return;
        }
        setDragSeconds(
          timeAt(event.clientX, event.clientY, event.currentTarget),
        );
      }}
      onPointerUp={(event) => {
        if (dragSeconds == null) {
          return;
        }
        const target = timeAt(event.clientX, event.clientY, event.currentTarget);
        setDragSeconds(null);
        onSeek(target);
      }}
      onPointerCancel={() => setDragSeconds(null)}
      onKeyDown={(event) => {
        if (!enabled || duration <= 0) {
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onSeek(Math.max(0, position - 2));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onSeek(Math.min(duration, position + 2));
        }
      }}
    />
  );
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  peaks: number[],
  duration: number,
  position: number,
  cue: number,
  bpm: number,
  firstBeat: number,
  orientation: WaveformOrientation,
  showBeatgrid: boolean,
  accent?: string,
) {
  const played = normalizeHex(accent);
  const dim = rgba(played, 0.35);
  const vertical = orientation === "vertical";
  const progress = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0;
  const buckets = Math.floor(peaks.length / 2);

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#050a10";
  context.fillRect(0, 0, width, height);

  // Grid waktu.
  context.strokeStyle = rgba(played, 0.08);
  context.lineWidth = 1;
  for (let i = 1; i < 8; i += 1) {
    if (vertical) {
      const y = Math.floor((height / 8) * i) + 0.5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    } else {
      const x = Math.floor((width / 8) * i) + 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  }

  const middle = vertical ? width / 2 : height / 2;
  context.strokeStyle = "rgba(142, 163, 181, 0.18)";
  context.beginPath();
  if (vertical) {
    context.moveTo(middle + 0.5, 0);
    context.lineTo(middle + 0.5, height);
  } else {
    context.moveTo(0, middle + 0.5);
    context.lineTo(width, middle + 0.5);
  }
  context.stroke();

  if (buckets > 0) {
    const amplitude = (vertical ? width : height) * 0.44;

    if (vertical) {
      const rows = Math.max(1, Math.floor(height));
      for (let y = 0; y < rows; y += 1) {
        const start = Math.floor((y / rows) * buckets);
        const end = Math.max(start + 1, Math.floor(((y + 1) / rows) * buckets));

        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (let i = start; i < end && i < buckets; i += 1) {
          min = Math.min(min, peaks[i * 2] ?? 0);
          max = Math.max(max, peaks[i * 2 + 1] ?? 0);
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          continue;
        }

        const left = middle - max * amplitude;
        const right = middle - min * amplitude;
        context.strokeStyle = (y + 0.5) / rows <= progress ? played : dim;
        context.beginPath();
        context.moveTo(Math.min(left, right), y + 0.5);
        context.lineTo(Math.max(left, right) + 0.5, y + 0.5);
        context.stroke();
      }
    } else {
      const columns = Math.max(1, Math.floor(width));
      for (let x = 0; x < columns; x += 1) {
        const start = Math.floor((x / columns) * buckets);
        const end = Math.max(start + 1, Math.floor(((x + 1) / columns) * buckets));

        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (let i = start; i < end && i < buckets; i += 1) {
          min = Math.min(min, peaks[i * 2] ?? 0);
          max = Math.max(max, peaks[i * 2 + 1] ?? 0);
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) {
          continue;
        }

        const top = middle - max * amplitude;
        const bottom = middle - min * amplitude;
        context.strokeStyle = (x + 0.5) / columns <= progress ? played : dim;
        context.beginPath();
        context.moveTo(x + 0.5, Math.min(top, bottom));
        context.lineTo(x + 0.5, Math.max(top, bottom) + 0.5);
        context.stroke();
      }
    }
  }

  if (duration > 0 && bpm > 0 && showBeatgrid) {
    drawBeatGrid(context, width, height, duration, bpm, firstBeat, vertical);
  }

  if (duration <= 0) {
    return;
  }

  const cueFraction = Math.min(Math.max(cue / duration, 0), 1);
  const playFraction = Math.min(Math.max(position / duration, 0), 1);

  context.strokeStyle = "#e879f9";
  context.lineWidth = 1.25;
  context.beginPath();
  if (vertical) {
    const y = cueFraction * height;
    context.moveTo(0, y);
    context.lineTo(width, y);
  } else {
    const x = cueFraction * width;
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  context.stroke();

  context.fillStyle = "#eaf7ff";
  context.beginPath();
  if (vertical) {
    const y = playFraction * height;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
    context.beginPath();
    context.moveTo(0, y - 4);
    context.lineTo(0, y + 4);
    context.lineTo(7, y);
  } else {
    const x = playFraction * width;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.beginPath();
    context.moveTo(x - 4, 0);
    context.lineTo(x + 4, 0);
    context.lineTo(x, 7);
  }
  context.closePath();
  context.fill();
}

/// Garis beatgrid: tiap beat tipis, tiap 4 beat (downbeat) lebih terang.
function drawBeatGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  duration: number,
  bpm: number,
  firstBeat: number,
  vertical: boolean,
) {
  const beat = 60 / bpm;
  if (!Number.isFinite(beat) || beat <= 0) {
    return;
  }

  // Jangan penuhi canvas bila track sangat panjang / zoom out.
  if ((beat / duration) * (vertical ? height : width) < 3) {
    return;
  }

  const first = ((firstBeat % beat) + beat) % beat;
  context.lineWidth = 1;

  let index = 0;
  for (let time = first; time <= duration; time += beat) {
    const downbeat = index % 4 === 0;
    context.strokeStyle = downbeat
      ? "rgba(103, 232, 249, 0.22)"
      : "rgba(103, 232, 249, 0.10)";
    context.beginPath();
    if (vertical) {
      const y = Math.floor((time / duration) * height) + 0.5;
      context.moveTo(0, y);
      context.lineTo(width, y);
    } else {
      const x = Math.floor((time / duration) * width) + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    context.stroke();
    index += 1;
  }
}

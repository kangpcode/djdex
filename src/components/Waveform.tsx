import { useEffect, useRef, useState } from "react";

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
  onSeek: (seconds: number) => void;
}

interface CanvasSize {
  width: number;
  height: number;
}

export function Waveform({
  peaks,
  duration,
  position,
  cue,
  bpm,
  firstBeat,
  enabled,
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
    );
  }, [peaks, size, duration, position, cue, bpm, firstBeat, dragSeconds]);

  const timeAt = (clientX: number, element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
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
        setDragSeconds(timeAt(event.clientX, event.currentTarget));
      }}
      onPointerMove={(event) => {
        if (dragSeconds == null) {
          return;
        }
        setDragSeconds(timeAt(event.clientX, event.currentTarget));
      }}
      onPointerUp={(event) => {
        if (dragSeconds == null) {
          return;
        }
        const target = timeAt(event.clientX, event.currentTarget);
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
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#050a10";
  context.fillRect(0, 0, width, height);

  // Grid waktu.
  context.strokeStyle = "rgba(34, 211, 238, 0.08)";
  context.lineWidth = 1;
  for (let i = 1; i < 8; i += 1) {
    const x = Math.floor((width / 8) * i) + 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  const middle = height / 2;
  context.strokeStyle = "rgba(142, 163, 181, 0.18)";
  context.beginPath();
  context.moveTo(0, middle + 0.5);
  context.lineTo(width, middle + 0.5);
  context.stroke();

  const buckets = Math.floor(peaks.length / 2);
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  const amplitude = height * 0.44;

  if (buckets > 0) {
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
      const played = (x + 0.5) / columns <= progress;
      context.strokeStyle = played ? "#67e8f9" : "#1d5f6c";
      context.beginPath();
      context.moveTo(x + 0.5, Math.min(top, bottom));
      context.lineTo(x + 0.5, Math.max(top, bottom) + 0.5);
      context.stroke();
    }
  }

  if (duration > 0 && bpm > 0) {
    drawBeatGrid(context, width, height, duration, bpm, firstBeat);
  }

  if (duration > 0) {
    const cueX = Math.min(Math.max(cue / duration, 0), 1) * width;
    context.strokeStyle = "#e879f9";
    context.lineWidth = 1.25;
    context.beginPath();
    context.moveTo(cueX, 0);
    context.lineTo(cueX, height);
    context.stroke();

    context.fillStyle = "#e879f9";
    context.beginPath();
    context.moveTo(cueX - 4, height);
    context.lineTo(cueX + 4, height);
    context.lineTo(cueX, height - 7);
    context.closePath();
    context.fill();

    const playX = Math.min(Math.max(position / duration, 0), 1) * width;
    context.strokeStyle = "#eaf7ff";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(playX, 0);
    context.lineTo(playX, height);
    context.stroke();

    context.fillStyle = "#eaf7ff";
    context.beginPath();
    context.moveTo(playX - 4, 0);
    context.lineTo(playX + 4, 0);
    context.lineTo(playX, 7);
    context.closePath();
    context.fill();
  }
}

/// Garis beatgrid: tiap beat tipis, tiap 4 beat (downbeat) lebih terang.
function drawBeatGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  duration: number,
  bpm: number,
  firstBeat: number,
) {
  const beat = 60 / bpm;
  if (!Number.isFinite(beat) || beat <= 0) {
    return;
  }

  // Jangan penuhi canvas bila track sangat panjang / zoom out.
  if ((beat / duration) * width < 3) {
    return;
  }

  const first = ((firstBeat % beat) + beat) % beat;
  context.lineWidth = 1;

  let index = 0;
  for (let time = first; time <= duration; time += beat) {
    const x = Math.floor((time / duration) * width) + 0.5;
    const downbeat = index % 4 === 0;
    context.strokeStyle = downbeat
      ? "rgba(103, 232, 249, 0.22)"
      : "rgba(103, 232, 249, 0.10)";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    index += 1;
  }
}
